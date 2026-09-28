/**
 * 对局服务测试。
 *
 * 本文件覆盖 `gameService` 对仓库的编排能力，重点验证内存状态缺失后能通过快照仓库恢复完整权威状态。
 * 测试不连接真实数据库，而是用内存快照仓库模拟 Prisma 快照结果，确保恢复逻辑保持在服务层且不污染 `game-core`。
 */
import { GameActionType, GameErrorCode } from "@gonghua/contracts";
import type { GameActionDTO } from "@gonghua/contracts";
import { getLegalActions, hasPendingBotAction } from "@gonghua/game-core";
import type { GameState } from "@gonghua/game-core";
import { describe, expect, it } from "vitest";
import { createGameService } from "./gameService";
import {
    MemoryGameActionLogRepository,
    MemoryGameRepository,
    MemoryGameSnapshotRepository,
} from "./memoryGameRepository";
import { NoopGameRecordRepository } from "./noopGameRecordRepository";
import type {
    GameActionPersistenceRepository,
    GameCreationPersistenceRepository,
    PersistCreatedGameInput,
    PersistSuccessfulGameActionInput,
    StoreResult,
} from "./types";

describe("createGameService", () => {
    it("创建对局会走统一初始持久化入口", async () => {
        const persistedGames: PersistCreatedGameInput[] = [];
        const service = createTestService({
            creationPersistenceRepository: {
                async persistCreatedGame(input) {
                    persistedGames.push(input);
                },
            },
        });

        const created = await service.createStoredGame({
            playerCount: 4,
            currentPlayerId: "player-1",
            seed: 1,
        });

        expect(created.success).toBe(true);
        expect(persistedGames).toHaveLength(1);
        expect(persistedGames[0]?.gameState.stateVersion).toBe(0);
        expect(persistedGames[0]?.localUser).toMatchObject({
            userId: "player-1",
            nickname: "我",
        });
        expect(persistedGames[0]?.actionLogEntry).toMatchObject({
            playerId: "player-1",
            success: true,
            errorCode: GameErrorCode.NONE,
        });
    });

    it("内存状态缺失时，可以从快照恢复玩家视角", async () => {
        const snapshotRepository = new MemoryGameSnapshotRepository();
        const created = await createTestService({
            snapshotRepository,
        }).createStoredGame({
            playerCount: 4,
            currentPlayerId: "player-1",
            seed: 1,
        });
        const gameId = getGameId(created);
        const restoredGameRepository = new MemoryGameRepository();
        const restoredService = createTestService({
            gameRepository: restoredGameRepository,
            snapshotRepository,
        });

        const restored = await restoredService.getStoredGameView(
            gameId,
            "player-1",
        );

        expect(restored.success).toBe(true);
        expect(restored.data?.viewState.gameId).toBe(gameId);
        expect(restoredGameRepository.getGame(gameId)?.gameId).toBe(gameId);
    });

    it("内存状态缺失时，可以先恢复再提交玩家动作", async () => {
        const snapshotRepository = new MemoryGameSnapshotRepository();
        const created = await createTestService({
            snapshotRepository,
        }).createStoredGame({
            playerCount: 4,
            currentPlayerId: "player-1",
            seed: 2,
        });
        const gameId = getGameId(created);
        const snapshot = await snapshotRepository.getLatestSnapshot(gameId);
        expect(snapshot).toBeDefined();
        const { playerId, action } = findRestorablePlayerAction(snapshot!);
        const restoredGameRepository = new MemoryGameRepository();
        const restoredService = createTestService({
            gameRepository: restoredGameRepository,
            snapshotRepository,
        });

        const submitted = await restoredService.submitStoredGameAction(
            gameId,
            playerId,
            action,
        );

        expect(submitted.success).toBe(true);
        expect(submitted.errorCode).toBe(GameErrorCode.NONE);
        expect(restoredGameRepository.getGame(gameId)?.gameId).toBe(gameId);
    });

    it("内存状态缺失时，可以先恢复再推进机器人动作", async () => {
        const snapshotRepository = new MemoryGameSnapshotRepository();
        const created = await createGameWithPendingBot(snapshotRepository);
        const gameId = getGameId(created);
        const restoredGameRepository = new MemoryGameRepository();
        const restoredService = createTestService({
            gameRepository: restoredGameRepository,
            snapshotRepository,
        });

        const submitted = await restoredService.submitStoredBotStep(
            gameId,
            "player-1",
        );

        expect(submitted.success).toBe(true);
        expect(submitted.errorCode).toBe(GameErrorCode.NONE);
        expect(restoredGameRepository.getGame(gameId)?.gameId).toBe(gameId);
    });

    it("相同客户端动作标识重复提交时，不会重复执行规则", async () => {
        const gameRepository = new MemoryGameRepository();
        const service = createTestService({ gameRepository });
        const created = await service.createStoredGame({
            playerCount: 4,
            currentPlayerId: "player-1",
            seed: 3,
        });
        const gameId = getGameId(created);
        const gameState = gameRepository.getGame(gameId);
        expect(gameState).toBeDefined();
        const { playerId, action } = findRestorablePlayerAction(gameState!);
        const clientActionId = "test-action-idempotent";

        const firstResult = await service.submitStoredGameAction(
            gameId,
            playerId,
            action,
            {
                clientActionId,
                stateVersion: gameState!.stateVersion,
            },
        );
        const versionAfterFirst = gameRepository.getGame(gameId)?.stateVersion;
        const secondResult = await service.submitStoredGameAction(
            gameId,
            playerId,
            action,
            {
                clientActionId,
                stateVersion: gameState!.stateVersion,
            },
        );

        expect(firstResult.success).toBe(true);
        expect(secondResult.success).toBe(true);
        expect(gameRepository.getGame(gameId)?.stateVersion).toBe(
            versionAfterFirst,
        );
    });

    it("客户端提交旧状态版本时，会拒绝动作并要求刷新", async () => {
        const gameRepository = new MemoryGameRepository();
        const service = createTestService({ gameRepository });
        const created = await service.createStoredGame({
            playerCount: 4,
            currentPlayerId: "player-1",
            seed: 4,
        });
        const gameId = getGameId(created);
        const gameState = gameRepository.getGame(gameId);
        expect(gameState).toBeDefined();
        const { playerId, action } = findRestorablePlayerAction(gameState!);
        const firstResult = await service.submitStoredGameAction(
            gameId,
            playerId,
            action,
            {
                clientActionId: "test-action-version-first",
                stateVersion: gameState!.stateVersion,
            },
        );
        expect(firstResult.success).toBe(true);

        const staleResult = await service.submitStoredGameAction(
            gameId,
            playerId,
            action,
            {
                clientActionId: "test-action-version-stale",
                stateVersion: gameState!.stateVersion,
            },
        );

        expect(staleResult.success).toBe(false);
        expect(staleResult.errorCode).toBe(
            GameErrorCode.STATE_VERSION_CONFLICT,
        );
    });

    it("成功玩家动作会走统一持久化入口", async () => {
        const gameRepository = new MemoryGameRepository();
        const persistedActions: PersistSuccessfulGameActionInput[] = [];
        const service = createTestService({
            gameRepository,
            actionPersistenceRepository: {
                async persistSuccessfulAction(input) {
                    persistedActions.push(input);
                },
            },
        });
        const created = await service.createStoredGame({
            playerCount: 4,
            currentPlayerId: "player-1",
            seed: 5,
        });
        const gameId = getGameId(created);
        const gameState = gameRepository.getGame(gameId);
        expect(gameState).toBeDefined();
        const { playerId, action } = findRestorablePlayerAction(gameState!);

        const submitted = await service.submitStoredGameAction(
            gameId,
            playerId,
            action,
            {
                clientActionId: "test-action-persistence",
                stateVersion: gameState!.stateVersion,
            },
        );

        expect(submitted.success).toBe(true);
        expect(persistedActions).toHaveLength(1);
        expect(persistedActions[0]?.gameState.stateVersion).toBe(1);
        expect(persistedActions[0]?.actionLogEntry).toMatchObject({
            gameId,
            playerId,
            clientActionId: "test-action-persistence",
            success: true,
            errorCode: GameErrorCode.NONE,
        });
    });
});

/**
 * 创建只使用内存仓库和空主记录仓库的测试服务，方便单独替换对局仓库模拟进程重启。
 */
function createTestService(input?: {
    gameRepository?: MemoryGameRepository;
    snapshotRepository?: MemoryGameSnapshotRepository;
    actionPersistenceRepository?: GameActionPersistenceRepository;
    creationPersistenceRepository?: GameCreationPersistenceRepository;
}) {
    return createGameService({
        gameRepository: input?.gameRepository ?? new MemoryGameRepository(),
        actionLogRepository: new MemoryGameActionLogRepository(),
        recordRepository: new NoopGameRecordRepository(),
        snapshotRepository:
            input?.snapshotRepository ?? new MemoryGameSnapshotRepository(),
        ...(input?.actionPersistenceRepository === undefined
            ? {}
            : {
                  actionPersistenceRepository:
                      input.actionPersistenceRepository,
              }),
        ...(input?.creationPersistenceRepository === undefined
            ? {}
            : {
                  creationPersistenceRepository:
                      input.creationPersistenceRepository,
              }),
    });
}

/**
 * 从服务响应中提取对局标识，避免每个测试重复写成功断言。
 */
function getGameId(result: StoreResult): string {
    expect(result.success).toBe(true);
    expect(result.data?.viewState.gameId).toBeTypeOf("string");
    return result.data!.viewState.gameId;
}

/**
 * 从快照里找一个当前可执行动作，测试重点是恢复链路，因此动作合法性直接复用核心枚举结果。
 */
function findRestorablePlayerAction(gameState: GameState): {
    playerId: string;
    action: GameActionDTO;
} {
    for (const player of gameState.players) {
        const action = getLegalActions(gameState, player.playerId).find(
            (item) =>
                item.actionType === GameActionType.EXCHANGE_TRUMP_CARD ||
                item.actionType === GameActionType.PLAY_ATTACK_CARD ||
                item.actionType === GameActionType.STOP_ATTACK,
        );
        if (action !== undefined) {
            return { playerId: player.playerId, action };
        }
    }
    throw new Error("测试快照中没有可提交动作");
}

/**
 * 创建一个有待处理机器人动作的快照，避免测试依赖某个固定洗牌种子的偶然结果。
 */
async function createGameWithPendingBot(
    snapshotRepository: MemoryGameSnapshotRepository,
): Promise<StoreResult> {
    for (let seed = 1; seed <= 50; seed += 1) {
        const result = await createTestService({
            snapshotRepository,
        }).createStoredGame({
            playerCount: 4,
            currentPlayerId: "player-1",
            seed,
        });
        const gameId = getGameId(result);
        const snapshot = await snapshotRepository.getLatestSnapshot(gameId);
        if (snapshot !== undefined && hasPendingBotAction(snapshot)) {
            return result;
        }
    }
    throw new Error("未找到有待处理机器人动作的测试对局");
}
