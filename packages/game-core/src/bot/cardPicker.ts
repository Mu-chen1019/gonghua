/**
 * 机器人选牌工具模块。
 *
 * 本文件只处理“从合法动作中挑哪一张牌”这类牌面选择细节。
 * `ruleBot` 负责阶段和角色流程判断，然后调用这里的 `pickLowestAttackAction`、`pickLowestDefenseAction`
 * 和 `sortCardsByPower` 保持当前最小牌优先策略；本文件不读取机器人行动阶段，也不修改 `GameState`。
 */
import { CardDTO, GameActionDTO, GameActionType } from "@gonghua/contracts";
import type { PlayerState } from "../model";
import { getRankWeight } from "../rules";

/**
 * 优先挑选最小的合法攻牌动作。
 */
export function pickLowestAttackAction(
    botPlayer: PlayerState,
    legalActions: GameActionDTO[],
): GameActionDTO | undefined {
    const attackActions = legalActions.filter(
        (
            action,
        ): action is Extract<
            GameActionDTO,
            { actionType: GameActionType.PLAY_ATTACK_CARD }
        > => action.actionType === GameActionType.PLAY_ATTACK_CARD,
    );
    for (const card of sortCardsByPower(botPlayer.handCards)) {
        const matchedAction = attackActions.find(
            (action) => action.cardId === card.id,
        );
        if (matchedAction !== undefined) {
            return matchedAction;
        }
    }
    return attackActions[0];
}

/**
 * 优先挑选最小的合法守牌动作。
 */
export function pickLowestDefenseAction(
    botPlayer: PlayerState,
    legalActions: GameActionDTO[],
): GameActionDTO | undefined {
    const defenseActions = legalActions.filter(
        (
            action,
        ): action is Extract<
            GameActionDTO,
            { actionType: GameActionType.PLAY_DEFENSE_CARD }
        > => action.actionType === GameActionType.PLAY_DEFENSE_CARD,
    );
    for (const card of sortCardsByPower(botPlayer.handCards)) {
        const matchedAction = defenseActions.find(
            (action) => action.cardId === card.id,
        );
        if (matchedAction !== undefined) {
            return matchedAction;
        }
    }
    return defenseActions[0];
}

/**
 * 按规则牌力从小到大排序，作为机器人最小出牌策略的基础。
 */
export function sortCardsByPower(cards: CardDTO[]): CardDTO[] {
    return cards
        .slice()
        .sort(
            (left, right) =>
                getRankWeight(left.rank) - getRankWeight(right.rank) ||
                left.id.localeCompare(right.id),
        );
}
