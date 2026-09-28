/**
 * 对局状态机入口模块。
 *
 * 本文件对外提供 `createGame`、`applyGameAction`、`applyBotActionStep`、`hasPendingBotAction`
 * 和 `checkCardConservation` 这些稳定入口。`applyGameAction` 只负责阶段校验、玩家校验和动作分发，
 * 具体规则分别交给 `attackActions`、`defenseActions`、`trumpExchange` 和 `gameProgress` 处理；
 * `applyBotActionStep` 只是把机器人选择出的动作重新送回同一套动作入口，保证真人和机器人共用规则校验。
 */
import {
    GameActionDTO,
    GameActionType,
    GameErrorCode,
    PlayerStatus,
} from "@gonghua/contracts";
import { logGameAction } from "./logger";
import { GameOperationResult, GameState } from "./model";
import {
    collectTableCards,
    giveUpDefense,
    moveDefenseCard,
    playDefenseCard,
    recallDefenseCard,
} from "./gameplay/defenseActions";
import {
    cloneGameState,
    createFailure,
    createSealedBattleState,
    findPlayerBySeat,
    removeCardFromHand,
} from "./gameplay/stateUtils";
import {
    playAttackCard,
    playAttackCards,
    stopAttack,
} from "./gameplay/attackActions";
import { createProgressResult } from "./gameplay/gameProgress";
import { exchangeTrumpCard } from "./gameplay/trumpExchange";
import {
    applyBotActionStep as applyBotActionStepInternal,
    hasPendingBotAction,
} from "./gameplay/botStep";
import { validateActionPhase } from "./gameplay/actionPhase";
export { createGame } from "./gameplay/gameSetup";
export { checkCardConservation } from "./gameplay/stateUtils";
export { hasPendingBotAction };

/**
 * 应用玩家提交的对局动作，只处理当前这一步，不自动连跑机器人。
 */
export function applyGameAction(
    gameState: GameState,
    playerId: string,
    action: GameActionDTO,
): GameOperationResult {
    /** 阶段校验先于玩家校验，避免结果态继续被动作修改。 */
    const phaseError = validateActionPhase(gameState, action);
    if (phaseError !== undefined) {
        return phaseError;
    }
    /** 动作发起玩家必须存在且仍处于可参与状态。 */
    const actor = gameState.players.find(
        (player) => player.playerId === playerId,
    );
    if (actor === undefined || actor.status !== PlayerStatus.ACTIVE) {
        return createFailure(
            GameErrorCode.INVALID_ACTOR,
            "动作玩家不存在或当前不可参与",
        );
    }

    logGameAction("round", "action_start", {
        gameId: gameState.gameId,
        phase: gameState.phase,
        roundAction: action.actionType,
        actorSeat: actor.seat,
        tablePairCount: gameState.tablePairs.length,
        isAttackSealed: gameState.roundBattleState.isAttackSealed,
        roundResult: gameState.roundBattleState.roundResult,
    });

    switch (action.actionType) {
        case GameActionType.EXCHANGE_TRUMP_CARD:
            return exchangeTrumpCard(gameState, actor);
        case GameActionType.PLAY_ATTACK_CARD:
            return playAttackCard(
                gameState,
                actor,
                action.cardId,
                createProgressResult,
            );
        case GameActionType.PLAY_ATTACK_CARDS:
            return playAttackCards(
                gameState,
                actor,
                action.cardIds,
                createProgressResult,
            );
        case GameActionType.PLAY_DEFENSE_CARD:
            return playDefenseCard(
                gameState,
                actor,
                action.cardId,
                action.targetPairId,
                createDefenseActionContext(),
            );
        case GameActionType.RECALL_DEFENSE_CARD:
            return recallDefenseCard(
                gameState,
                actor,
                action.sourcePairId,
                createDefenseActionContext(),
            );
        case GameActionType.MOVE_DEFENSE_CARD:
            return moveDefenseCard(
                gameState,
                actor,
                action.sourcePairId,
                action.targetPairId,
                createDefenseActionContext(),
            );
        case GameActionType.STOP_ATTACK:
            return stopAttack(gameState, actor, createProgressResult);
        case GameActionType.GIVE_UP_DEFENSE:
            return giveUpDefense(
                gameState,
                actor,
                createDefenseActionContext(),
            );
        case GameActionType.COLLECT_TABLE_CARDS:
            return collectTableCards(
                gameState,
                actor,
                createDefenseActionContext(),
            );
        default:
            return createFailure(
                GameErrorCode.INVALID_ACTION_ARGUMENT,
                "不支持的动作类型",
            );
    }
}

/**
 * 只推进一个机器人动作，用于前端按固定延迟逐步展示机器人操作。
 */
export function applyBotActionStep(gameState: GameState): GameOperationResult {
    return applyBotActionStepInternal(gameState, applyGameAction);
}

/**
 * 创建防守动作模块需要的引擎上下文。
 */
function createDefenseActionContext() {
    return {
        cloneGameState,
        createFailure,
        createProgressResult,
        createSealedBattleState,
        findPlayerBySeat,
        removeCardFromHand,
    };
}
