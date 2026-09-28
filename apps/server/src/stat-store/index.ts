/**
 * 玩家统计仓库统一出口。
 *
 * 本文件根据数据库配置选择 Prisma 或空仓库实现，路由层不直接感知底层存储。
 */
import { isDatabaseConfigured } from "../db/prisma";
import { NoopPlayerStatRepository } from "./noopPlayerStatRepository";
import { PrismaPlayerStatRepository } from "./prismaPlayerStatRepository";
export type { PlayerStatRepository } from "./types";
export { NoopPlayerStatRepository } from "./noopPlayerStatRepository";
export { PrismaPlayerStatRepository } from "./prismaPlayerStatRepository";

/** 当前默认玩家统计仓库，配置数据库后读取 PostgreSQL。 */
const playerStatRepository = isDatabaseConfigured()
    ? new PrismaPlayerStatRepository()
    : new NoopPlayerStatRepository();

export const getStoredPlayerStat =
    playerStatRepository.getPlayerStat.bind(playerStatRepository);

export const listStoredPlayerStats =
    playerStatRepository.listPlayerStats.bind(playerStatRepository);
