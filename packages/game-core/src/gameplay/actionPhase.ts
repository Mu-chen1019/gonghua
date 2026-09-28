/**
 * 动作阶段校验模块。
 *
 * 本文件只提供 `validateActionPhase`，用于在 `engine.applyGameAction` 分发具体动作前先拦截明显不匹配的阶段。
 * 它只校验阶段和动作类型的粗粒度关系，角色、牌面、目标牌位等细节仍交给对应动作模块处理。
 */
import {
    GameActionDTO,
    GameActionType,
    GameErrorCode,
    GamePhase,
} from "@gonghua/contracts";
import { GameOperationResult, GameState } from "../model";
import { createFailure } from "./stateUtils";

/**
 * 校验当前阶段是否允许继续提交攻防动作。
 */
export function validateActionPhase(
    gameState: GameState,
    action: GameActionDTO,
): GameOperationResult | undefined {
    if (gameState.phase === GamePhase.GAME_OVER) {
        return createFailure(GameErrorCode.INVALID_PHASE, "对局已经结束");
    }
    if (gameState.phase === GamePhase.TRUMP_EXCHANGE_READY) {
        if (action.actionType === GameActionType.EXCHANGE_TRUMP_CARD) {
            return undefined;
        }
        return createFailure(
            GameErrorCode.INVALID_PHASE,
            "当前等待玩家换底，不能执行其他动作",
        );
    }
    if (action.actionType === GameActionType.EXCHANGE_TRUMP_CARD) {
        return undefined;
    }
    if (gameState.phase === GamePhase.ROUND_RESULT_READY) {
        return createFailure(
            GameErrorCode.ROUND_ALREADY_FINISHED,
            "当前轮已经结束，等待后续结算",
        );
    }
    if (gameState.phase === GamePhase.WAITING_DEFENSE_REFILL) {
        return createFailure(
            GameErrorCode.WAITING_DEFENSE_REFILL,
            "受攻方正在等待中途添牌",
        );
    }
    if (gameState.phase === GamePhase.DEFENSE_COLLECTING) {
        if (
            action.actionType === GameActionType.PLAY_ATTACK_CARD ||
            action.actionType === GameActionType.PLAY_ATTACK_CARDS ||
            action.actionType === GameActionType.STOP_ATTACK ||
            action.actionType === GameActionType.COLLECT_TABLE_CARDS
        ) {
            return undefined;
        }
        return createFailure(
            GameErrorCode.INVALID_PHASE,
            "受攻失败收牌阶段只允许追加攻牌或确认收牌",
        );
    }
    if (
        gameState.phase !== GamePhase.FIRST_ATTACK_READY &&
        gameState.phase !== GamePhase.ROUND_ACTIVE
    ) {
        return createFailure(
            GameErrorCode.INVALID_PHASE,
            "当前对局阶段不允许攻防动作",
        );
    }
    return undefined;
}
