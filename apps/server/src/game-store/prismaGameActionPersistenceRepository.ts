/**
 * Prisma 动作持久化仓库模块。
 *
 * 本文件负责成功动作后的事务型落库，把对局主记录、对局玩家关系、对局结果、玩家统计、快照和动作日志收在同一个事务内。
 * 它不参与规则判断，只接收 `gameService` 已经通过 `game-core` 得到的最新权威状态和动作日志内容。
 */
import { getPrismaClient } from "../db/prisma";
import { createGameActionLogInTransaction } from "./prismaGameActionLogRepository";
import { updateGameRecordInTransaction } from "./prismaGameRecordRepository";
import { saveLatestSnapshotInTransaction } from "./prismaGameSnapshotRepository";
import type {
    GameActionPersistenceRepository,
    PersistSuccessfulGameActionInput,
} from "./types";

/**
 * Prisma 实现的成功动作事务持久化仓库。
 */
export class PrismaGameActionPersistenceRepository implements GameActionPersistenceRepository {
    /**
     * 在单个数据库事务内保存成功动作后的全部持久化数据。
     */
    async persistSuccessfulAction(
        input: PersistSuccessfulGameActionInput,
    ): Promise<void> {
        const prisma = getPrismaClient();
        await prisma.$transaction(async (tx) => {
            await updateGameRecordInTransaction(tx, input.gameState);
            await saveLatestSnapshotInTransaction(tx, input.gameState);
            await createGameActionLogInTransaction(tx, input.actionLogEntry);
        });
    }
}
