/**
 * 前端攻花流程日志工具，统一输出页面、请求和本地状态变化。
 */
import { formatChineseGameLog, GameLogContextDTO } from "@gonghua/contracts";

/**
 * 前端日志上下文，只记录公开调试信息，不输出完整手牌或敏感参数。
 */
export type WebGameLogContext = GameLogContextDTO;

/**
 * 输出前端流程日志，格式与核心和服务端保持一致。
 */
export function logWebGameAction(
    stage: string,
    action: string,
    context?: WebGameLogContext,
): void {
    /** 最终输出中文日志，内部仍使用结构化字段保证可维护性。 */
    console.info(formatChineseGameLog(stage, action, context));
}
