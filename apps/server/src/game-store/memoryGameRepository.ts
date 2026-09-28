/**
 * 内存对局仓库模块。
 *
 * 本文件提供 `GameRepository` 和 `GameActionLogRepository` 的内存实现，用于当前单机开发和后续数据库实现前的兼容运行。
 * `MemoryGameRepository` 只保存最新权威状态，`MemoryGameActionLogRepository` 只保存动作日志列表；
 * 两者都不包含业务规则，业务编排统一放在 `gameService`。
 */
import type { GameState } from "@gonghua/game-core";
import { GameErrorCode } from "@gonghua/contracts";
import type { GameActionRecordDTO } from "@gonghua/contracts";
import type {
    GameActionLogEntry,
    GameActionLogRepository,
    GameRepository,
    GameSnapshotRepository,
} from "./types";

/**
 * 首版使用的内存对局仓库，后续接数据库时可替换为 Prisma 实现。
 */
export class MemoryGameRepository implements GameRepository {
    /** 内存中的权威对局状态表。 */
    private readonly games = new Map<string, GameState>();

    /**
     * 保存最新权威对局状态。
     */
    saveGame(gameState: GameState): void {
        this.games.set(gameState.gameId, gameState);
    }

    /**
     * 按对局标识读取权威状态。
     */
    getGame(gameId: string): GameState | undefined {
        return this.games.get(gameId);
    }
}

/**
 * 当前开发阶段的内存动作日志仓库，先用于稳定服务边界。
 */
export class MemoryGameActionLogRepository implements GameActionLogRepository {
    /** 内存动作日志列表，后续数据库阶段会替换为落库。 */
    private readonly actionLogs: GameActionLogEntry[] = [];

    /**
     * 追加一条动作日志。
     */
    appendActionLog(entry: GameActionLogEntry): void {
        this.actionLogs.push(entry);
    }

    /**
     * 查询内存动作日志，主要用于未配置数据库时保持接口可用。
     */
    async listActionLogs(
        gameId: string,
        limit: number,
    ): Promise<GameActionRecordDTO[]> {
        return Promise.resolve(
            this.actionLogs
                .filter((entry) => entry.gameId === gameId)
                .slice(-limit)
                .reverse()
                .map((entry, index) => ({
                    id: `${entry.gameId}-memory-${index}`,
                    gameId: entry.gameId,
                    ...(entry.clientActionId === undefined
                        ? {}
                        : { clientActionId: entry.clientActionId }),
                    playerId: entry.playerId,
                    actorType: "memory",
                    actionType: entry.action?.actionType ?? "query",
                    payloadJson: entry.action ?? {},
                    beforeVersion: 0,
                    ...(entry.success ? { afterVersion: 0 } : {}),
                    success: entry.success,
                    ...(entry.errorCode === GameErrorCode.NONE
                        ? {}
                        : { errorCode: entry.errorCode }),
                    ...(entry.errorMessage.length === 0
                        ? {}
                        : { errorMessage: entry.errorMessage }),
                    eventJson: entry.events,
                    createdAt: new Date().toISOString(),
                })),
        );
    }

    /**
     * 按客户端动作标识查询内存日志，模拟数据库幂等查询能力。
     */
    async getActionLogByClientActionId(
        gameId: string,
        clientActionId: string,
    ): Promise<GameActionRecordDTO | undefined> {
        const entry = this.actionLogs.find(
            (item) =>
                item.gameId === gameId &&
                item.clientActionId === clientActionId,
        );
        if (entry === undefined) {
            return Promise.resolve(undefined);
        }
        return Promise.resolve({
            id: `${entry.gameId}-memory-idempotent`,
            gameId: entry.gameId,
            clientActionId,
            playerId: entry.playerId,
            actorType: "memory",
            actionType: entry.action?.actionType ?? "query",
            payloadJson: entry.action ?? {},
            beforeVersion: 0,
            ...(entry.success ? { afterVersion: 0 } : {}),
            success: entry.success,
            ...(entry.errorCode === GameErrorCode.NONE
                ? {}
                : { errorCode: entry.errorCode }),
            ...(entry.errorMessage.length === 0
                ? {}
                : { errorMessage: entry.errorMessage }),
            eventJson: entry.events,
            createdAt: new Date().toISOString(),
        });
    }
}

/**
 * 当前开发阶段的内存快照仓库，用于无数据库模式下保持恢复接口边界。
 */
export class MemoryGameSnapshotRepository implements GameSnapshotRepository {
    /** 内存快照表，仅保存每局最新一份快照。 */
    private readonly snapshots = new Map<string, GameState>();

    /**
     * 保存最新对局快照。
     */
    async saveLatestSnapshot(gameState: GameState): Promise<void> {
        this.snapshots.set(gameState.gameId, gameState);
        return Promise.resolve();
    }

    /**
     * 读取指定对局的最新快照。
     */
    async getLatestSnapshot(gameId: string): Promise<GameState | undefined> {
        return Promise.resolve(this.snapshots.get(gameId));
    }
}
