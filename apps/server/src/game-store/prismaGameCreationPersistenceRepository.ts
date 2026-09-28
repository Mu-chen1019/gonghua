/**
 * Prisma 创建对局持久化仓库模块。
 *
 * 本文件负责创建对局后的初始数据事务落库，把用户、对局主记录、玩家关系、初始快照和开局日志收在同一个事务内。
 * 它只处理数据库一致性，不参与发牌、首攻判定或玩家视角过滤。
 */
import { getPrismaClient } from "../db/prisma";
import { createGameActionLogInTransaction } from "./prismaGameActionLogRepository";
import { createGameRecordInTransaction } from "./prismaGameRecordRepository";
import { saveLatestSnapshotInTransaction } from "./prismaGameSnapshotRepository";
import type {
    GameCreationPersistenceRepository,
    PersistCreatedGameInput,
} from "./types";

/**
 * Prisma 实现的创建对局事务持久化仓库。
 */
export class PrismaGameCreationPersistenceRepository implements GameCreationPersistenceRepository {
    /**
     * 在单个数据库事务内保存创建对局后的全部初始持久化数据。
     */
    async persistCreatedGame(input: PersistCreatedGameInput): Promise<void> {
        const prisma = getPrismaClient();
        await prisma.$transaction(async (tx) => {
            await tx.user.upsert({
                where: { id: input.localUser.userId },
                update:
                    input.localUser.avatarUrl === undefined
                        ? {}
                        : { avatarUrl: input.localUser.avatarUrl },
                create: {
                    id: input.localUser.userId,
                    nickname: input.localUser.nickname,
                    ...(input.localUser.avatarUrl === undefined
                        ? {}
                        : { avatarUrl: input.localUser.avatarUrl }),
                },
            });
            await createGameRecordInTransaction(tx, input.gameState, {
                ...(input.roomId === undefined ? {} : { roomId: input.roomId }),
                ...(input.mode === undefined ? {} : { mode: input.mode }),
            });
            await saveLatestSnapshotInTransaction(tx, input.gameState);
            await createGameActionLogInTransaction(tx, input.actionLogEntry);
        });
    }
}
