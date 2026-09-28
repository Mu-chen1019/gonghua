/**
 * 玩家统计仓库类型模块。
 *
 * 本文件定义玩家战绩统计的查询边界，统计写入由对局结果落库时触发。
 * 查询和写入分开，避免个人页接口和对局结算流程互相耦合。
 */
import type { PlayerStatDTO } from "@gonghua/contracts";

/**
 * 玩家统计仓库接口。
 */
export interface PlayerStatRepository {
    getPlayerStat: (userId: string) => Promise<PlayerStatDTO>; // 查询单个玩家统计，不存在时返回默认统计。
    listPlayerStats: (limit: number) => Promise<PlayerStatDTO[]>; // 查询玩家统计排行。
}
