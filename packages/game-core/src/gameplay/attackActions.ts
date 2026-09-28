/**
 * 进攻动作模块。
 *
 * 本文件包含 `playAttackCard`、`playAttackCards` 和 `stopAttack`，分别处理单张攻牌、一次性多张攻牌与声明停止进攻。
 * 出牌动作都会先做角色和牌面合法性校验，再通过传入的 `createProgressResult` 触发统一轮内推进；
 * 因此本模块不直接决定轮是否结束，只负责把进攻侧动作写入状态副本。
 */
import {
    GameErrorCode,
    GameEventDTO,
    GameEventType,
    GamePhase,
} from "@gonghua/contracts";
import type { GameOperationResult, GameState, PlayerState } from "../model";
import { logGameAction } from "../logger";
import { canAddAttackCard, isAttackRoleSeat, isMainAttackSeat } from "../rules";
import {
    cloneGameState,
    createFailure,
    findPlayerBySeat,
    removeCardFromHand,
} from "./stateUtils";
import type { CardDTO } from "@gonghua/contracts";

/**
 * 进攻动作依赖的流程推进函数。
 */
export type AttackProgressHandler = (
    gameState: GameState,
    events: GameEventDTO[],
) => GameOperationResult;

/**
 * 处理主攻或助攻打出攻牌的动作。
 */
export function playAttackCard(
    gameState: GameState,
    actor: PlayerState,
    cardId: string,
    createProgressResult: AttackProgressHandler,
): GameOperationResult {
    return playAttackCards(gameState, actor, [cardId], createProgressResult);
}

/**
 * 处理主攻或助攻一次性打出多张攻牌的动作。
 */
export function playAttackCards(
    gameState: GameState,
    actor: PlayerState,
    cardIds: string[],
    createProgressResult: AttackProgressHandler,
): GameOperationResult {
    if (cardIds.length === 0) {
        return createFailure(
            GameErrorCode.INVALID_ACTION_ARGUMENT,
            "至少需要选择一张攻牌",
        );
    }
    /** 批量攻牌必须先排除重复标识，避免同一张牌被多次写入桌面。 */
    const uniqueCardIds = new Set(cardIds);
    if (uniqueCardIds.size !== cardIds.length) {
        return createFailure(
            GameErrorCode.INVALID_ACTION_ARGUMENT,
            "不能重复选择同一张攻牌",
        );
    }
    /** 攻牌必须来自动作玩家当前手牌。 */
    const cards = cardIds.map((cardId) =>
        actor.handCards.find((item) => item.id === cardId),
    );
    if (cards.some((card) => card === undefined)) {
        return createFailure(
            GameErrorCode.CARD_NOT_IN_HAND,
            "攻击牌不在发起玩家手牌中",
        );
    }
    const attackCards = cards as CardDTO[];

    if (gameState.phase === GamePhase.FIRST_ATTACK_READY) {
        if (!isMainAttackSeat(actor.seat, gameState.roundRoleState)) {
            return createFailure(
                GameErrorCode.ROLE_NOT_ALLOWED,
                "只有主攻方可以打出首张攻牌",
            );
        }
        if (gameState.roundRoleState.currentTurnSeat !== actor.seat) {
            return createFailure(
                GameErrorCode.NOT_CURRENT_ACTOR,
                "当前尚未轮到该主攻方行动",
            );
        }
    } else if (!isAttackRoleSeat(actor.seat, gameState.roundRoleState)) {
        return createFailure(
            GameErrorCode.ROLE_NOT_ALLOWED,
            "只有主攻方或助攻方可以追加攻牌",
        );
    } else if (isAttackStopped(gameState, actor.seat)) {
        return createFailure(
            GameErrorCode.ATTACK_ALREADY_STOPPED,
            "该攻击方已经停止进攻，不能继续出攻牌",
        );
    } else {
        /** 批量追加时按同一次提交内的牌位渐进校验，让后续牌可命中本批前面牌的点数。 */
        const stagedPairs = gameState.tablePairs.slice();
        for (const attackCard of attackCards) {
            if (
                !canAddAttackCard(
                    attackCard,
                    stagedPairs,
                    gameState.roundBattleState.isAttackSealed,
                    gameState.roundBattleState.sealCardRank,
                )
            ) {
                return createFailure(
                    gameState.roundBattleState.isAttackSealed
                        ? GameErrorCode.ATTACK_SEALED
                        : GameErrorCode.ATTACK_RANK_NOT_MATCHED,
                    gameState.roundBattleState.isAttackSealed
                        ? "当前轮已封攻，不允许该追加攻牌"
                        : "追加攻牌未命中桌面已有点数",
                );
            }
            stagedPairs.push({
                pairId: `pending-${stagedPairs.length + 1}-${attackCard.id}`,
                attackCard,
            });
        }
    }

    /** 通过状态副本写入动作结果，保持调用方原状态不被直接修改。 */
    const nextState = cloneGameState(gameState);
    /** 副本中的动作玩家，用于移除已经打出的手牌。 */
    const nextActor = findPlayerBySeat(nextState.players, actor.seat);
    /** 从手牌中移除并得到进入桌面的全部攻牌。 */
    const nextCards = [];
    for (const cardId of cardIds) {
        const nextCard = removeCardFromHand(nextActor, cardId);
        if (nextCard === undefined) {
            return createFailure(
                GameErrorCode.CARD_NOT_IN_HAND,
                "攻击牌不在发起玩家手牌中",
            );
        }
        nextCards.push(nextCard);
    }
    for (const nextCard of nextCards) {
        nextState.tablePairs.push({
            pairId: `pair-${nextState.tablePairs.length + 1}-${nextCard.id}`,
            attackCard: nextCard,
        });
    }
    nextState.phase =
        gameState.phase === GamePhase.DEFENSE_COLLECTING
            ? GamePhase.DEFENSE_COLLECTING
            : GamePhase.ROUND_ACTIVE;
    if (gameState.phase === GamePhase.FIRST_ATTACK_READY) {
        nextState.roundRoleState.currentTurnSeat =
            nextState.roundRoleState.defendSeat;
    }
    logGameAction("round", "play_attack_card", {
        gameId: nextState.gameId,
        phase: nextState.phase,
        actorSeat: actor.seat,
        cardLabel: nextCards.map((card) => card.label).join("、"),
        tablePairCount: nextState.tablePairs.length,
    });

    /** 批量动作已经校验至少一张牌，这里取首张牌作为事件关联牌。 */
    const eventCard = nextCards[0];
    if (eventCard === undefined) {
        return createFailure(
            GameErrorCode.STATE_INCONSISTENT,
            "攻牌事件生成失败",
        );
    }
    return createProgressResult(nextState, [
        {
            type: GameEventType.ATTACK_CARD_PLAYED,
            playerId: actor.playerId,
            cardId: eventCard.id,
            message: `${actor.name} 打出 攻牌：${nextCards.map((card) => card.label).join("、")}`,
        },
    ]);
}

/**
 * 处理主攻方或助攻方声明停止进攻的动作。
 */
export function stopAttack(
    gameState: GameState,
    actor: PlayerState,
    createProgressResult: AttackProgressHandler,
): GameOperationResult {
    if (
        gameState.phase !== GamePhase.ROUND_ACTIVE &&
        gameState.phase !== GamePhase.DEFENSE_COLLECTING
    ) {
        return createFailure(
            GameErrorCode.INVALID_PHASE,
            "当前阶段不能停止进攻",
        );
    }
    if (!isAttackRoleSeat(actor.seat, gameState.roundRoleState)) {
        return createFailure(
            GameErrorCode.ROLE_NOT_ALLOWED,
            "只有主攻方或助攻方可以停止进攻",
        );
    }
    if (isAttackStopped(gameState, actor.seat)) {
        return createFailure(
            GameErrorCode.ATTACK_ALREADY_STOPPED,
            "该攻击方已经停止进攻",
        );
    }

    /** 停止进攻只记录玩家意愿，是否结束本轮由统一进度判断处理。 */
    const nextState = cloneGameState(gameState);
    nextState.roundBattleState.stoppedAttackSeats =
        nextState.roundBattleState.stoppedAttackSeats.concat(actor.seat);
    logGameAction("round", "stop_attack", {
        gameId: nextState.gameId,
        phase: nextState.phase,
        actorSeat: actor.seat,
        supportSeats: nextState.roundBattleState.stoppedAttackSeats.join(","),
    });

    return createProgressResult(nextState, [
        {
            type: GameEventType.ATTACK_STOPPED,
            playerId: actor.playerId,
            message: `${actor.name} 停止 进攻`,
        },
    ]);
}

/**
 * 判断指定进攻座位是否已经声明停止进攻。
 */
function isAttackStopped(gameState: GameState, seat: number): boolean {
    return gameState.roundBattleState.stoppedAttackSeats.includes(seat);
}
