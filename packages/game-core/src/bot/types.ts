/**
 * 机器人策略类型模块。
 *
 * 本文件沉淀机器人策略内部共享类型，目前只有 `BotStrategy` 负责描述“根据状态和机器人玩家选择动作”的能力。
 * `ruleBot` 实现默认规则机器人，后续简单、困难或 AI 机器人都应复用该接口，不直接修改对局状态。
 */
import type { GameActionDTO } from "@gonghua/contracts";
import type { GameState, PlayerState } from "../model";

/**
 * 机器人策略接口，只返回动作意图，不直接写入权威状态。
 */
export interface BotStrategy {
    selectAction: (
        gameState: GameState,
        botPlayer: PlayerState,
    ) => GameActionDTO | undefined; // 根据当前状态和机器人玩家选择动作。
}
