/**
 * 服务端日志模块，统一输出接口和状态仓库的流程日志。
 */
import { formatChineseGameLog, GameLogContextDTO } from "@gonghua/contracts";

/**
 * 服务端日志上下文，只记录排查问题所需的非敏感信息。
 */
export type ServerLogContext = GameLogContextDTO;

/**
 * 输出服务端流程日志，避免业务代码分散使用控制台输出。
 */
export function logServerAction(
    stage: string,
    action: string,
    context?: ServerLogContext,
): void {
    /** 最终输出中文日志，内部仍使用结构化字段保证可维护性。 */
    console.info(formatChineseGameLog(stage, action, context));
}
