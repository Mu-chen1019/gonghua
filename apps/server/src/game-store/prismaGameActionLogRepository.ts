/**
 * Prisma 对局动作日志仓库模块。
 *
 * 本文件负责把玩家、机器人和系统动作写入 `GameAction` 表，并提供按对局查询能力。
 * 日志只记录动作摘要、事件和版本信息，不参与动作合法性判断。
 */
import type { Prisma } from "@prisma/client";
import type { GameActionRecordDTO } from "@gonghua/contracts";
import { GameErrorCode } from "@gonghua/contracts";
import { getPrismaClient } from "../db/prisma";
import type { GameActionLogEntry, GameActionLogRepository } from "./types";

/** 默认动作日志来源，当前无法识别真实来源时使用系统来源兜底。 */
const DEFAULT_ACTOR_TYPE = "system";

/**
 * Prisma 实现的对局动作日志仓库。
 */
export class PrismaGameActionLogRepository implements GameActionLogRepository {
    /**
     * 追加一条动作日志，版本号根据当前 Game 表状态推导。
     */
    async appendActionLog(entry: GameActionLogEntry): Promise<void> {
        const prisma = getPrismaClient();
        await prisma.$transaction(async (tx) =>
            createGameActionLogInTransaction(tx, entry),
        );
    }

    /**
     * 查询指定客户端动作标识的日志，用于重复请求直接返回原结果。
     */
    async getActionLogByClientActionId(
        gameId: string,
        clientActionId: string,
    ): Promise<GameActionRecordDTO | undefined> {
        const prisma = getPrismaClient();
        const record = await prisma.gameAction.findUnique({
            where: {
                gameId_clientActionId: {
                    gameId,
                    clientActionId,
                },
            },
        });
        return record === null ? undefined : toGameActionRecordDTO(record);
    }

    /**
     * 查询指定对局的动作日志，新日志排在前面，方便排查最近动作。
     */
    async listActionLogs(
        gameId: string,
        limit: number,
    ): Promise<GameActionRecordDTO[]> {
        const prisma = getPrismaClient();
        const records = await prisma.gameAction.findMany({
            where: { gameId },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
        return records.map(toGameActionRecordDTO);
    }
}

/**
 * 在外部事务中写入动作日志，并根据事务内最新对局版本推导 before/after 版本。
 */
export async function createGameActionLogInTransaction(
    tx: Prisma.TransactionClient,
    entry: GameActionLogEntry,
): Promise<void> {
    const game = await tx.game.findUnique({
        where: { id: entry.gameId },
        select: { stateVersion: true },
    });
    if (game === null) {
        return;
    }
    const eventPlayerId = entry.events.find(
        (event) => event.playerId !== undefined,
    )?.playerId;
    const actorPlayerId = eventPlayerId ?? entry.playerId;
    const gamePlayer = await tx.gamePlayer.findUnique({
        where: {
            gameId_userId: {
                gameId: entry.gameId,
                userId: actorPlayerId,
            },
        },
        select: {
            seat: true,
            playerType: true,
        },
    });
    const afterVersion = entry.success ? game.stateVersion : undefined;
    await tx.gameAction.create({
        data: {
            gameId: entry.gameId,
            ...(entry.clientActionId === undefined
                ? {}
                : { clientActionId: entry.clientActionId }),
            playerId: actorPlayerId,
            ...(gamePlayer === null ? {} : { seat: gamePlayer.seat }),
            actorType: gamePlayer?.playerType ?? DEFAULT_ACTOR_TYPE,
            actionType:
                entry.action?.actionType ??
                entry.events[0]?.type ??
                "system_event",
            payloadJson: toJsonValue(entry.action ?? {}),
            beforeVersion:
                afterVersion === undefined
                    ? game.stateVersion
                    : Math.max(afterVersion - 1, 0),
            ...(afterVersion === undefined ? {} : { afterVersion }),
            success: entry.success,
            ...(entry.errorCode === GameErrorCode.NONE
                ? {}
                : { errorCode: entry.errorCode }),
            ...(entry.errorMessage.length === 0
                ? {}
                : { errorMessage: entry.errorMessage }),
            eventJson: toJsonValue(entry.events),
        },
    });
}

/**
 * 把普通对象转换成 Prisma JSON 入参，避免 Date 或 undefined 泄漏进 JSON 字段。
 */
function toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * 把 Prisma 动作日志记录转换为接口响应 DTO。
 */
function toGameActionRecordDTO(record: {
    id: string;
    gameId: string;
    clientActionId: string | null;
    playerId: string | null;
    seat: number | null;
    actorType: string;
    actionType: string;
    payloadJson: Prisma.JsonValue;
    beforeVersion: number;
    afterVersion: number | null;
    success: boolean;
    errorCode: string | null;
    errorMessage: string | null;
    eventJson: Prisma.JsonValue | null;
    createdAt: Date;
}): GameActionRecordDTO {
    return {
        id: record.id,
        gameId: record.gameId,
        ...(record.clientActionId === null
            ? {}
            : { clientActionId: record.clientActionId }),
        ...(record.playerId === null ? {} : { playerId: record.playerId }),
        ...(record.seat === null ? {} : { seat: record.seat }),
        actorType: record.actorType,
        actionType: record.actionType,
        payloadJson: record.payloadJson,
        beforeVersion: record.beforeVersion,
        ...(record.afterVersion === null
            ? {}
            : { afterVersion: record.afterVersion }),
        success: record.success,
        ...(record.errorCode === null ? {} : { errorCode: record.errorCode }),
        ...(record.errorMessage === null
            ? {}
            : { errorMessage: record.errorMessage }),
        ...(record.eventJson === null ? {} : { eventJson: record.eventJson }),
        createdAt: record.createdAt.toISOString(),
    };
}
