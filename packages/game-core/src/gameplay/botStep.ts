/**
 * 机器人单步推进模块。
 *
 * 本文件衔接 `bot.ts` 策略和 `engine.applyGameAction` 执行入口。
 * `hasPendingBotAction` 用于判断前端是否需要继续延迟推进，`applyBotActionStep` 每次只执行一个机器人动作并生成事件；
 * 机器人动作仍会回到统一动作入口校验，避免策略模块直接修改状态。
 */
import {
    GameActionDTO,
    GameActionType,
    GameEventDTO,
    GameEventType,
} from "@gonghua/contracts";
import { findNextBotActor, selectBotAction } from "../bot";
import { logGameAction } from "../logger";
import { GameOperationResult, GameState, PlayerState } from "../model";
import { createSuccess } from "./stateUtils";

/**
 * 机器人动作应用函数，通常由引擎入口注入 `applyGameAction`。
 */
export type BotActionApplier = (
    gameState: GameState,
    playerId: string,
    action: GameActionDTO,
) => GameOperationResult;

/**
 * 判断当前状态下是否存在等待推进的机器人动作。
 */
export function hasPendingBotAction(gameState: GameState): boolean {
    const botActor = findNextBotActor(gameState);
    if (botActor === undefined) {
        return false;
    }
    return selectBotAction(gameState, botActor) !== undefined;
}

/**
 * 只推进一个机器人动作，用于前端按固定延迟逐步展示机器人操作。
 */
export function applyBotActionStep(
    gameState: GameState,
    applyGameAction: BotActionApplier,
): GameOperationResult {
    const botActor = findNextBotActor(gameState);
    if (botActor === undefined) {
        return createSuccess(gameState, []);
    }
    const botAction = selectBotAction(gameState, botActor);
    if (botAction === undefined) {
        return createSuccess(gameState, []);
    }
    logGameAction("bot", "bot_action_selected", {
        gameId: gameState.gameId,
        playerId: botActor.playerId,
        actorSeat: botActor.seat,
        roundAction: botAction.actionType,
    });
    const events: GameEventDTO[] = [
        {
            type: GameEventType.BOT_ACTION_SELECTED,
            playerId: botActor.playerId,
            message: createBotActionMessage(gameState, botActor, botAction),
        },
    ];
    const result = applyGameAction(gameState, botActor.playerId, botAction);
    if (!result.success || result.gameState === undefined) {
        return result;
    }
    return createSuccess(result.gameState, events.concat(result.events));
}

/**
 * 生成机器人动作选择事件文案，便于前端事件栏展示自动流程。
 */
function createBotActionMessage(
    gameState: GameState,
    botActor: PlayerState,
    action: GameActionDTO,
): string {
    switch (action.actionType) {
        case GameActionType.EXCHANGE_TRUMP_CARD:
            return `${botActor.name} 选择 换底`;
        case GameActionType.PLAY_ATTACK_CARD:
            return `${botActor.name} 选择 攻牌：${findCardLabel(botActor, action.cardId)}`;
        case GameActionType.PLAY_ATTACK_CARDS:
            return `${botActor.name} 选择 攻牌：${action.cardIds.map((cardId) => findCardLabel(botActor, cardId)).join("、")}`;
        case GameActionType.PLAY_DEFENSE_CARD:
            return `${botActor.name} 选择 守牌：${findCardLabel(botActor, action.cardId)} 防守 ${findAttackCardLabel(gameState, action.targetPairId)}`;
        case GameActionType.STOP_ATTACK:
            return `${botActor.name} 选择 停止进攻`;
        case GameActionType.GIVE_UP_DEFENSE:
            return `${botActor.name} 选择 放弃防守`;
        case GameActionType.COLLECT_TABLE_CARDS:
            return `${botActor.name} 选择 确认收牌`;
        default:
            return `${botActor.name} 选择 自动动作`;
    }
}

/**
 * 从玩家手牌中查找事件文案需要展示的牌面。
 */
function findCardLabel(player: PlayerState, cardId: string): string {
    return player.handCards.find((card) => card.id === cardId)?.label ?? cardId;
}

/**
 * 从桌面牌位中查找机器人防守目标的攻牌牌面。
 */
function findAttackCardLabel(gameState: GameState, pairId: string): string {
    return (
        gameState.tablePairs.find((pair) => pair.pairId === pairId)?.attackCard
            .label ?? pairId
    );
}
