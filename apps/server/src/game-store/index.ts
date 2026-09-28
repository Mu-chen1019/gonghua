/**
 * 对局仓库模块统一出口。
 *
 * 本文件创建当前服务端默认使用的内存仓库和对局服务，并继续导出路由层需要的业务函数。
 * 后续接 PostgreSQL + Prisma 时，可以在这里根据配置切换仓库实现，路由层不需要感知存储类型变化。
 */
import { isDatabaseConfigured } from "../db/prisma";
import { createGameService } from "./gameService";
import {
    MemoryGameActionLogRepository,
    MemoryGameRepository,
    MemoryGameSnapshotRepository,
} from "./memoryGameRepository";
import { NoopGameRecordRepository } from "./noopGameRecordRepository";
import { PrismaGameActionLogRepository } from "./prismaGameActionLogRepository";
import { PrismaGameActionPersistenceRepository } from "./prismaGameActionPersistenceRepository";
import { PrismaGameCreationPersistenceRepository } from "./prismaGameCreationPersistenceRepository";
import { PrismaGameRecordRepository } from "./prismaGameRecordRepository";
import { PrismaGameSnapshotRepository } from "./prismaGameSnapshotRepository";
export type {
    CreateStoredGameInput,
    GameActionLogEntry,
    GameActionLogRepository,
    GameActionPersistenceRepository,
    GameCreationPersistenceRepository,
    GameParticipantResult,
    GameRecordRepository,
    GameRepository,
    GameSnapshotRepository,
    LocalUserRecordInput,
    StoreResult,
} from "./types";
export {
    MemoryGameActionLogRepository,
    MemoryGameRepository,
    MemoryGameSnapshotRepository,
} from "./memoryGameRepository";
export { NoopGameRecordRepository } from "./noopGameRecordRepository";
export { PrismaGameActionLogRepository } from "./prismaGameActionLogRepository";
export { PrismaGameActionPersistenceRepository } from "./prismaGameActionPersistenceRepository";
export { PrismaGameCreationPersistenceRepository } from "./prismaGameCreationPersistenceRepository";
export { PrismaGameRecordRepository } from "./prismaGameRecordRepository";
export { PrismaGameSnapshotRepository } from "./prismaGameSnapshotRepository";
export { createGameService } from "./gameService";

/** 当前默认对局状态仓库，仍使用内存实现保证现有功能不变。 */
const gameRepository = new MemoryGameRepository();

/** 当前默认动作日志仓库，配置数据库后写入 PostgreSQL。 */
const actionLogRepository = isDatabaseConfigured()
    ? new PrismaGameActionLogRepository()
    : new MemoryGameActionLogRepository();

/** 当前默认对局主记录仓库，配置数据库后写入 PostgreSQL，否则使用空实现。 */
const recordRepository = isDatabaseConfigured()
    ? new PrismaGameRecordRepository()
    : new NoopGameRecordRepository();

/** 当前默认对局快照仓库，配置数据库后支持恢复兜底。 */
const snapshotRepository = isDatabaseConfigured()
    ? new PrismaGameSnapshotRepository()
    : new MemoryGameSnapshotRepository();

/** 当前默认成功动作持久化仓库，配置数据库后使用事务写入。 */
const actionPersistenceRepository = isDatabaseConfigured()
    ? new PrismaGameActionPersistenceRepository()
    : undefined;

/** 当前默认创建对局持久化仓库，配置数据库后使用事务写入。 */
const creationPersistenceRepository = isDatabaseConfigured()
    ? new PrismaGameCreationPersistenceRepository()
    : undefined;

/** 默认对局服务实例，路由层继续使用这些稳定函数。 */
const gameService = createGameService({
    gameRepository,
    actionLogRepository,
    recordRepository,
    snapshotRepository,
    ...(actionPersistenceRepository === undefined
        ? {}
        : { actionPersistenceRepository }),
    ...(creationPersistenceRepository === undefined
        ? {}
        : { creationPersistenceRepository }),
});

export const {
    createStoredGame,
    getStoredGameParticipant,
    getStoredGameView,
    getStoredGameResult,
    listStoredGameActionLogs,
    listStoredGameRecords,
    submitStoredGameAction,
    submitStoredBotStep,
    finishStoredGame,
} = gameService;
