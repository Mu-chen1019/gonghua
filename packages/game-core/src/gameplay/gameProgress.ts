/**
 * 对局进度推进模块。
 *
 * 本文件以 `createProgressResult` 作为动作成功后的统一出口，集中处理受攻成功、受攻方中途添牌、只出不添排名、
 * 轮结算递归推进和牌数守恒校验。攻击、防守、换底等动作模块只负责写入当前动作结果，
 * 是否继续结算、补牌或结束对局都在这里统一判断。
 */
import {
    GameErrorCode,
    GameEventDTO,
    GameEventType,
    GamePhase,
    PlayerStatus,
    RoundResult,
} from "@gonghua/contracts";
import { GameOperationResult, GameState, PlayerState } from "../model";
import { logGameAction } from "../logger";
import { areAllPairsDefended, countUncoveredPairs } from "../rules";
import {
    finalizeNoRefill,
    getFinishRoundResult,
    settleRound,
} from "./roundSettlement";
import {
    checkCardConservation,
    createFailure,
    createSuccess,
    findPlayerBySeat,
} from "./stateUtils";

/**
 * 基于动作后的状态生成成功结果，并处理轮结果和中途添牌等待态。
 */
export function createProgressResult(
    gameState: GameState,
    events: GameEventDTO[],
): GameOperationResult {
    /** 当前受攻方用于判断是否需要中途添牌。 */
    const defender = findPlayerBySeat(
        gameState.players,
        gameState.roundRoleState.defendSeat,
    );
    if (isDefenseSuccessReady(gameState)) {
        const settlementEvents: GameEventDTO[] = [
            ...events,
            {
                type: GameEventType.ROUND_RESULT_READY,
                message: "系统 生成 受攻成功结果",
            },
        ];
        return createProgressResult(
            settleRound(
                gameState,
                RoundResult.DEFENSE_SUCCESS,
                settlementEvents,
            ),
            settlementEvents,
        );
    }
    if (
        gameState.phase === GamePhase.ROUND_ACTIVE &&
        defender.handCards.length === 0 &&
        countUncoveredPairs(gameState.tablePairs) > 0
    ) {
        refillDefender(gameState, defender, events);
    }
    /** 记录已完成座位，便于识别本次动作是否产生只出不添阶段的直接胜出玩家。 */
    const finishedSeatsBefore = new Set(
        gameState.players
            .filter((player) => player.status === PlayerStatus.FINISHED)
            .map((player) => player.seat),
    );
    const finishedSeats = finalizeNoRefill(gameState, events);
    const directRoundResult = getFinishRoundResult(
        gameState,
        finishedSeats.filter((seat) => !finishedSeatsBefore.has(seat)),
    );
    if (
        directRoundResult !== undefined &&
        gameState.phase !== GamePhase.GAME_OVER
    ) {
        const settlementEvents: GameEventDTO[] = [
            ...events,
            {
                type: GameEventType.ROUND_RESULT_READY,
                message:
                    directRoundResult === RoundResult.DEFENSE_SUCCESS
                        ? "系统 生成 受攻方出完牌胜利结果"
                        : "系统 生成 攻击方出完牌胜利结果",
            },
        ];
        return createProgressResult(
            settleRound(gameState, directRoundResult, settlementEvents),
            settlementEvents,
        );
    }
    /** 每次动作完成后都校验牌数，确保没有重复归属或丢牌。 */
    const conservation = checkCardConservation(gameState);
    if (!conservation.success) {
        return createFailure(
            GameErrorCode.STATE_INCONSISTENT,
            conservation.errorMessage,
        );
    }
    logGameAction("round", "action_complete", {
        gameId: gameState.gameId,
        phase: gameState.phase,
        deckCount: gameState.deck.length,
        tablePairCount: gameState.tablePairs.length,
        totalCards: conservation.totalCards,
        roundResult: gameState.roundBattleState.roundResult,
        success: true,
    });
    return createSuccess(gameState, events);
}

/**
 * 处理受攻方中途添牌，补到常规手牌上限后继续当前攻防轮。
 */
function refillDefender(
    gameState: GameState,
    defender: PlayerState,
    events: GameEventDTO[],
): void {
    events.push({
        type: GameEventType.DEFENSE_REFILL_REQUIRED,
        playerId: defender.playerId,
        message: `${defender.name} 需要 中途添牌`,
    });
    /** 牌堆耗尽后进入只出不添，不再停留在中途添牌等待态。 */
    if (gameState.deck.length === 0 || gameState.isNoRefillMode) {
        gameState.isNoRefillMode = true;
        gameState.phase = GamePhase.ROUND_ACTIVE;
        events.push({
            type: GameEventType.DEFENSE_CARDS_REFILLED,
            playerId: defender.playerId,
            message: `系统 补给 ${defender.name} 中途手牌：0 张`,
        });
        return;
    }
    let refillCount = 0;
    while (
        defender.handCards.length < gameState.config.initialHandSize &&
        gameState.deck.length > 0
    ) {
        const card = gameState.deck.shift();
        if (card === undefined) {
            break;
        }
        defender.handCards.push(card);
        refillCount += 1;
    }
    gameState.phase = GamePhase.ROUND_ACTIVE;
    events.push({
        type: GameEventType.DEFENSE_CARDS_REFILLED,
        playerId: defender.playerId,
        message: `系统 补给 ${defender.name} 中途手牌：${refillCount} 张`,
    });
}

/**
 * 判断是否满足受攻成功的完整结束条件。
 */
function isDefenseSuccessReady(gameState: GameState): boolean {
    if (gameState.phase !== GamePhase.ROUND_ACTIVE) {
        return false;
    }
    if (!areAllPairsDefended(gameState.tablePairs)) {
        return false;
    }
    /** 必须所有主攻和助攻都停止进攻，本轮才真正形成受攻成功结果。 */
    return allAttackStopped(gameState);
}

/**
 * 判断当前轮所有攻击角色是否均已停止进攻。
 */
function allAttackStopped(gameState: GameState): boolean {
    return [
        gameState.roundRoleState.attackSeat,
        ...gameState.roundRoleState.supportSeats,
    ].every((seat) => {
        const player = gameState.players.find((item) => item.seat === seat);
        return (
            player?.status === PlayerStatus.FINISHED ||
            gameState.roundBattleState.stoppedAttackSeats.includes(seat)
        );
    });
}
