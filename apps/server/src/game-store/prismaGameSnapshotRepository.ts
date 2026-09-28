/**
 * Prisma 对局快照仓库模块。
 *
 * 本文件负责把完整 `GameState` 保存为 JSON 快照，并在内存状态缺失时提供恢复来源。
 * 快照只作为恢复兜底，不改变 `game-core` 的纯规则职责。
 */
import type { Prisma } from "@prisma/client";
import type { GameState } from "@gonghua/game-core";
import { getPrismaClient } from "../db/prisma";
import type { GameSnapshotRepository } from "./types";

/**
 * Prisma 实现的对局快照仓库。
 */
export class PrismaGameSnapshotRepository implements GameSnapshotRepository {
    /**
     * 保存指定对局的最新快照，版本号取服务端权威状态中的 stateVersion。
     */
    async saveLatestSnapshot(gameState: GameState): Promise<void> {
        const prisma = getPrismaClient();
        await prisma.$transaction(async (tx) =>
            saveLatestSnapshotInTransaction(tx, gameState),
        );
    }

    /**
     * 查询指定对局最新快照，恢复前只做最小结构校验。
     */
    async getLatestSnapshot(gameId: string): Promise<GameState | undefined> {
        const prisma = getPrismaClient();
        const snapshot = await prisma.gameSnapshot.findFirst({
            where: { gameId },
            orderBy: { stateVersion: "desc" },
        });
        if (snapshot === null || !isGameStateLike(snapshot.stateJson)) {
            return undefined;
        }
        return snapshot.stateJson as unknown as GameState;
    }
}

/**
 * 在外部事务中保存指定对局的最新快照。
 */
export async function saveLatestSnapshotInTransaction(
    tx: Prisma.TransactionClient,
    gameState: GameState,
): Promise<void> {
    const game = await tx.game.findUnique({
        where: { id: gameState.gameId },
        select: { id: true },
    });
    if (game === null) {
        return;
    }
    await tx.gameSnapshot.upsert({
        where: {
            gameId_stateVersion: {
                gameId: gameState.gameId,
                stateVersion: gameState.stateVersion,
            },
        },
        update: {
            stateJson: toJsonValue(gameState),
        },
        create: {
            gameId: gameState.gameId,
            stateVersion: gameState.stateVersion,
            stateJson: toJsonValue(gameState),
        },
    });
}

/**
 * 把对局状态转换为 Prisma JSON 入参，去掉 undefined 等 JSON 不支持的值。
 */
function toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * 恢复快照前的最小结构校验，避免明显错误数据进入内存仓库。
 */
function isGameStateLike(value: Prisma.JsonValue): boolean {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return (
        typeof record.gameId === "string" &&
        typeof record.phase === "string" &&
        Array.isArray(record.players) &&
        Array.isArray(record.deck) &&
        Array.isArray(record.tablePairs)
    );
}
