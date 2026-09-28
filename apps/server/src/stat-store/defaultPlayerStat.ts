/**
 * 玩家统计默认值模块。
 *
 * 本文件集中维护玩家没有完成任何对局时的统计默认值。
 */
import type { PlayerStatDTO } from "@gonghua/contracts";

/**
 * 创建空玩家统计。
 */
export function createDefaultPlayerStat(userId: string): PlayerStatDTO {
    return {
        userId,
        totalGames: 0,
        winGames: 0,
        averageRank: 0,
    };
}
