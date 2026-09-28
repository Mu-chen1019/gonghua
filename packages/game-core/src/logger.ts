/**
 * 游戏核心日志模块。
 *
 * 本文件封装 `logGameAction`，把规则执行、玩家动作、机器人动作和错误信息统一转换为中文控制台日志。
 * 各动作模块只传入事件类型和公开调试上下文，最终格式化由 `contracts` 中的日志格式化函数负责。
 */
import { formatChineseGameLog, GameLogContextDTO } from "@gonghua/contracts";

/**
 * 游戏核心日志上下文，只记录可公开调试的状态摘要。
 */
export type GameLogContext = GameLogContextDTO;

/**
 * 输出游戏核心流程日志，避免规则模块分散使用控制台输出。
 */
export function logGameAction(
    stage: string,
    action: string,
    context?: GameLogContext,
): void {
    /** 最终输出中文日志，内部仍使用结构化字段保证可维护性。 */
    console.info(formatChineseGameLog(stage, action, context));
}
