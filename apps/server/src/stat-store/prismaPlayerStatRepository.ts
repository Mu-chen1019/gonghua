/**
 * Prisma 玩家统计仓库模块。
 *
 * 本文件负责读取 `PlayerStat` 表，给个人页和排行榜接口使用。
 * 统计更新由对局结束落库流程触发，本文件不计算游戏结果。
 */
import type { PlayerStatDTO } from "@gonghua/contracts";
import { getPrismaClient } from "../db/prisma";
import { createDefaultPlayerStat } from "./defaultPlayerStat";
import type { PlayerStatRepository } from "./types";

/**
 * Prisma 实现的玩家统计仓库。
 */
export class PrismaPlayerStatRepository implements PlayerStatRepository {
    /**
     * 查询单个玩家统计，不存在时返回默认统计。
     */
    async getPlayerStat(userId: string): Promise<PlayerStatDTO> {
        const prisma = getPrismaClient();
        const stat = await prisma.playerStat.findUnique({
            where: { userId },
        });
        return stat === null
            ? createDefaultPlayerStat(userId)
            : toPlayerStatDTO(stat);
    }

    /**
     * 查询玩家统计排行，优先按胜场排序。
     */
    async listPlayerStats(limit: number): Promise<PlayerStatDTO[]> {
        const prisma = getPrismaClient();
        const stats = await prisma.playerStat.findMany({
            orderBy: [
                { winGames: "desc" },
                { totalGames: "desc" },
                { averageRank: "asc" },
            ],
            take: limit,
        });
        return stats.map(toPlayerStatDTO);
    }
}

/**
 * 把 Prisma 玩家统计转换为接口响应 DTO。
 */
function toPlayerStatDTO(record: {
    userId: string;
    totalGames: number;
    winGames: number;
    averageRank: number;
    lastGameAt: Date | null;
    updatedAt: Date;
}): PlayerStatDTO {
    return {
        userId: record.userId,
        totalGames: record.totalGames,
        winGames: record.winGames,
        averageRank: record.averageRank,
        ...(record.lastGameAt === null
            ? {}
            : { lastGameAt: record.lastGameAt.toISOString() }),
        updatedAt: record.updatedAt.toISOString(),
    };
}
