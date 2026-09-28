/**
 * 空玩家统计仓库模块。
 *
 * 本文件用于未配置数据库的开发和测试环境，返回稳定默认统计。
 */
import type { PlayerStatDTO } from "@gonghua/contracts";
import { createDefaultPlayerStat } from "./defaultPlayerStat";
import type { PlayerStatRepository } from "./types";

/**
 * 未配置数据库时使用的玩家统计空实现。
 */
export class NoopPlayerStatRepository implements PlayerStatRepository {
    /**
     * 返回空玩家统计。
     */
    async getPlayerStat(userId: string): Promise<PlayerStatDTO> {
        return Promise.resolve(createDefaultPlayerStat(userId));
    }

    /**
     * 未配置数据库时返回空排行榜。
     */
    async listPlayerStats(): Promise<PlayerStatDTO[]> {
        return Promise.resolve([]);
    }
}
