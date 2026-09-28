/**
 * 对局服务模块。
 *
 * 本文件负责把路由请求转换为核心状态机调用，并通过仓库接口读写权威状态。
 * 创建对局、查询视角、提交玩家动作和推进机器人动作都在这里编排；
 * 具体规则仍由 `game-core` 处理，具体存储由注入的对局仓库、动作日志仓库和主记录仓库处理。
 */
import { randomUUID } from "node:crypto";
import {
    GameErrorCode,
    GameEventType,
    GameFinishReason,
    GameMode,
    GamePhase,
    PlayerType,
} from "@gonghua/contracts";
import type {
    GameActionDTO,
    GameActionRecordDTO,
    GameEventDTO,
    PlayerIdentityDTO,
} from "@gonghua/contracts";
import {
    applyBotActionStep,
    applyGameAction,
    createGame,
    createPlayerView,
    hasPendingBotAction,
} from "@gonghua/game-core";
import type { GameState } from "@gonghua/game-core";
import { logServerAction } from "../logger";
import type {
    CreateStoredGameInput,
    GameActionLogRepository,
    GameActionPersistenceRepository,
    GameCreationPersistenceRepository,
    GameParticipantResult,
    GameRecordRepository,
    GameRepository,
    GameSnapshotRepository,
    ListGameRecordsInput,
    SubmitGameActionContext,
    StoreResult,
} from "./types";

/**
 * 创建对局服务实例，调用方通过注入仓库决定使用内存或数据库存储。
 */
export function createGameService(input: {
    gameRepository: GameRepository;
    actionLogRepository: GameActionLogRepository;
    recordRepository: GameRecordRepository;
    snapshotRepository: GameSnapshotRepository;
    actionPersistenceRepository?: GameActionPersistenceRepository;
    creationPersistenceRepository?: GameCreationPersistenceRepository;
}) {
    const {
        gameRepository,
        actionLogRepository,
        recordRepository,
        snapshotRepository,
        actionPersistenceRepository,
        creationPersistenceRepository,
    } = input;
    /** 同一对局的状态修改必须串行执行，避免并发动作覆盖同一份内存状态。 */
    const mutationQueues = new Map<string, Promise<void>>();

    /**
     * 创建并保存一局新对局，同时返回创建玩家的可见视角。
     */
    async function createStoredGame(
        input: CreateStoredGameInput,
    ): Promise<StoreResult> {
        /** 服务端生成的对局标识，避免前端控制权威状态主键。 */
        const gameId = randomUUID();
        /** 创建核心状态所需的稳定入参。 */
        const createOptions = {
            gameId,
            mode: input.mode ?? GameMode.NORMAL,
            playerCount: input.playerCount,
            currentPlayerId: input.currentPlayerId,
            players:
                input.players ??
                createDefaultPlayerIdentities(
                    input.playerCount,
                    input.currentPlayerId,
                    input.currentPlayerName,
                ),
        };
        /** 游戏核心负责生成完整权威状态和开局事件。 */
        const result = createGame(
            input.seed === undefined
                ? createOptions
                : { ...createOptions, seed: input.seed },
        );
        if (!result.success || result.gameState === undefined) {
            logServerAction("store", "create_game_failed", {
                errorCode: result.errorCode,
                errorMessage: result.errorMessage,
                success: false,
            });
            await actionLogRepository.appendActionLog({
                gameId,
                playerId: input.currentPlayerId,
                events: result.events,
                success: false,
                errorCode: result.errorCode,
                errorMessage: result.errorMessage,
            });
            return {
                success: false,
                errorCode: result.errorCode,
                errorMessage: result.errorMessage,
            };
        }
        const createdGameState = result.gameState;
        gameRepository.saveGame(createdGameState);
        const localUser = {
            userId: input.currentPlayerId,
            nickname: input.currentPlayerName ?? "我",
        };
        const createActionLogEntry = {
            gameId,
            playerId: input.currentPlayerId,
            events: result.events,
            success: true,
            errorCode: GameErrorCode.NONE,
            errorMessage: "",
        };
        await persistCreatedGameWithoutBlockingGame(
            createdGameState,
            input.roomId,
            input.mode,
            localUser,
            createActionLogEntry,
        );
        logServerAction("store", "create_game_saved", {
            gameId,
            phase: createdGameState.phase,
            playerCount: input.playerCount,
            deckCount: createdGameState.deck.length,
            tablePairCount: createdGameState.tablePairs.length,
            success: true,
        });
        return {
            success: true,
            data: {
                viewState: createPlayerView(
                    createdGameState,
                    input.currentPlayerId,
                ),
                events: result.events,
                hasPendingBotAction: hasPendingBotAction(createdGameState),
            },
            errorCode: GameErrorCode.NONE,
            errorMessage: "",
        };
    }

    /**
     * 获取指定玩家的对局视角，不向前端泄漏完整权威状态。
     */
    async function getStoredGameView(
        gameId: string,
        playerId: string,
    ): Promise<StoreResult> {
        /** 仓库中的权威对局状态。 */
        let gameState = gameRepository.getGame(gameId);
        if (gameState === undefined) {
            gameState = await restoreGameFromSnapshot(gameId);
        }
        if (gameState === undefined) {
            logServerAction("store", "get_game_not_found", {
                gameId,
                playerId,
                errorCode: GameErrorCode.GAME_NOT_FOUND,
                success: false,
            });
            return {
                success: false,
                errorCode: GameErrorCode.GAME_NOT_FOUND,
                errorMessage: "对局不存在",
            };
        }
        logServerAction("store", "get_game_view", {
            gameId,
            playerId,
            phase: gameState.phase,
            deckCount: gameState.deck.length,
            tablePairCount: gameState.tablePairs.length,
            success: true,
        });
        return {
            success: true,
            data: {
                viewState: createPlayerView(gameState, playerId),
                events: [],
                hasPendingBotAction: hasPendingBotAction(gameState),
            },
            errorCode: GameErrorCode.NONE,
            errorMessage: "",
        };
    }

    /**
     * 提交玩家动作，核心规则校验通过后保存最新权威状态。
     */
    async function submitStoredGameAction(
        gameId: string,
        playerId: string,
        action: GameActionDTO,
        context: SubmitGameActionContext = {},
    ): Promise<StoreResult> {
        return enqueueGameMutation(gameId, () =>
            submitStoredGameActionInQueue(gameId, playerId, action, context),
        );
    }

    /**
     * 在单局串行队列内提交玩家动作，确保读取、校验、保存不会被同局其他动作插队。
     */
    async function submitStoredGameActionInQueue(
        gameId: string,
        playerId: string,
        action: GameActionDTO,
        context: SubmitGameActionContext,
    ): Promise<StoreResult> {
        /** 动作提交前的权威对局状态。 */
        let gameState = gameRepository.getGame(gameId);
        if (gameState === undefined) {
            gameState = await restoreGameFromSnapshot(gameId);
        }
        if (gameState === undefined) {
            logServerAction("store", "submit_action_not_found", {
                gameId,
                playerId,
                roundAction: action.actionType,
                errorCode: GameErrorCode.GAME_NOT_FOUND,
                success: false,
            });
            return {
                success: false,
                errorCode: GameErrorCode.GAME_NOT_FOUND,
                errorMessage: "对局不存在",
            };
        }
        const repeatedResult = await getRepeatedActionResult(
            gameState,
            playerId,
            context.clientActionId,
        );
        if (repeatedResult !== undefined) {
            return repeatedResult;
        }
        if (
            context.stateVersion !== undefined &&
            context.stateVersion !== gameState.stateVersion
        ) {
            const errorMessage = `状态版本已更新，请刷新后再操作。当前版本=${gameState.stateVersion}，提交版本=${context.stateVersion}`;
            logServerAction("store", "submit_action_version_conflict", {
                gameId,
                playerId,
                ...(context.clientActionId === undefined
                    ? {}
                    : { clientActionId: context.clientActionId }),
                stateVersion: context.stateVersion,
                latestStateVersion: gameState.stateVersion,
                roundAction: action.actionType,
                errorCode: GameErrorCode.STATE_VERSION_CONFLICT,
                success: false,
            });
            await actionLogRepository.appendActionLog({
                gameId,
                playerId,
                ...(context.clientActionId === undefined
                    ? {}
                    : { clientActionId: context.clientActionId }),
                action,
                events: [],
                success: false,
                errorCode: GameErrorCode.STATE_VERSION_CONFLICT,
                errorMessage,
            });
            return {
                success: false,
                errorCode: GameErrorCode.STATE_VERSION_CONFLICT,
                errorMessage,
            };
        }
        /** 游戏核心负责校验动作合法性并产出新状态。 */
        const result = applyGameAction(gameState, playerId, action);
        if (!result.success || result.gameState === undefined) {
            logServerAction("store", "submit_action_failed", {
                gameId,
                playerId,
                phase: gameState.phase,
                roundAction: action.actionType,
                errorCode: result.errorCode,
                errorMessage: result.errorMessage,
                success: false,
            });
            await actionLogRepository.appendActionLog({
                gameId,
                playerId,
                ...(context.clientActionId === undefined
                    ? {}
                    : { clientActionId: context.clientActionId }),
                action,
                events: result.events,
                success: false,
                errorCode: result.errorCode,
                errorMessage: result.errorMessage,
            });
            return {
                success: false,
                errorCode: result.errorCode,
                errorMessage: result.errorMessage,
            };
        }
        const updatedGameState = advanceGameVersion(result.gameState);
        gameRepository.saveGame(updatedGameState);
        const actionLogEntry = {
            gameId,
            playerId,
            ...(context.clientActionId === undefined
                ? {}
                : { clientActionId: context.clientActionId }),
            action,
            events: result.events,
            success: true,
            errorCode: GameErrorCode.NONE,
            errorMessage: "",
        };
        await persistSuccessfulActionWithoutBlockingGame(
            "保存玩家成功动作",
            updatedGameState,
            actionLogEntry,
        );
        logServerAction("store", "submit_action_saved", {
            gameId,
            playerId,
            phase: updatedGameState.phase,
            roundAction: action.actionType,
            stateVersion: updatedGameState.stateVersion,
            deckCount: updatedGameState.deck.length,
            tablePairCount: updatedGameState.tablePairs.length,
            success: true,
        });
        return {
            success: true,
            data: {
                viewState: createPlayerView(updatedGameState, playerId),
                events: result.events,
                hasPendingBotAction: hasPendingBotAction(updatedGameState),
            },
            errorCode: GameErrorCode.NONE,
            errorMessage: "",
        };
    }

    /**
     * 推进一个机器人动作，供前端按固定延迟逐步展示自动操作。
     */
    async function submitStoredBotStep(
        gameId: string,
        playerId: string,
    ): Promise<StoreResult> {
        return enqueueGameMutation(gameId, () =>
            submitStoredBotStepInQueue(gameId, playerId),
        );
    }

    /**
     * 主动结束人机对局，退出和重开都走这里收口，避免旧局继续被恢复。
     */
    async function finishStoredGame(
        gameId: string,
        playerId: string,
        finishReason: GameFinishReason,
    ): Promise<StoreResult> {
        return enqueueGameMutation(gameId, () =>
            finishStoredGameInQueue(gameId, playerId, finishReason),
        );
    }

    /**
     * 在单局串行队列内结束人机对局，确保和玩家动作、机器人动作互斥。
     */
    async function finishStoredGameInQueue(
        gameId: string,
        playerId: string,
        finishReason: GameFinishReason,
    ): Promise<StoreResult> {
        let gameState = gameRepository.getGame(gameId);
        if (gameState === undefined) {
            gameState = await restoreGameFromSnapshot(gameId);
        }
        if (gameState === undefined) {
            logServerAction("store", "finish_game_not_found", {
                gameId,
                playerId,
                errorCode: GameErrorCode.GAME_NOT_FOUND,
                success: false,
            });
            return {
                success: false,
                errorCode: GameErrorCode.GAME_NOT_FOUND,
                errorMessage: "对局不存在",
            };
        }
        if (
            (gameState.config.mode ?? GameMode.NORMAL) !==
            GameMode.HUMAN_VS_BOTS
        ) {
            return {
                success: false,
                errorCode: GameErrorCode.INVALID_ACTION_ARGUMENT,
                errorMessage: "只有人机模式可以主动退出或重新开始",
            };
        }
        const player = gameState.players.find(
            (item) => item.playerId === playerId,
        );
        if (player === undefined || player.isBot) {
            return {
                success: false,
                errorCode: GameErrorCode.INVALID_ACTOR,
                errorMessage: "只有本局真人玩家可以结束人机对局",
            };
        }
        const updatedGameState = advanceGameVersion({
            ...gameState,
            phase: GamePhase.GAME_OVER,
        });
        const events: GameEventDTO[] = [
            {
                type: GameEventType.GAME_OVER,
                playerId,
                message:
                    finishReason === GameFinishReason.RESTART
                        ? `${player.name} 重新开始，本局结束`
                        : `${player.name} 退出游戏，本局结束`,
            },
        ];
        gameRepository.saveGame(updatedGameState);
        const actionLogEntry = {
            gameId,
            playerId,
            events,
            success: true,
            errorCode: GameErrorCode.NONE,
            errorMessage: "",
        };
        await persistFinishedGameWithoutBlockingGame(
            updatedGameState,
            finishReason,
            actionLogEntry,
        );
        logServerAction("store", "finish_game_saved", {
            gameId,
            playerId,
            finishReason,
            stateVersion: updatedGameState.stateVersion,
            success: true,
        });
        return {
            success: true,
            data: {
                viewState: createPlayerView(updatedGameState, playerId),
                events,
                hasPendingBotAction: false,
            },
            errorCode: GameErrorCode.NONE,
            errorMessage: "",
        };
    }

    /**
     * 在单局串行队列内推进机器人动作，避免和玩家动作同时修改权威状态。
     */
    async function submitStoredBotStepInQueue(
        gameId: string,
        playerId: string,
    ): Promise<StoreResult> {
        /** 动作提交前的权威对局状态。 */
        let gameState = gameRepository.getGame(gameId);
        if (gameState === undefined) {
            gameState = await restoreGameFromSnapshot(gameId);
        }
        if (gameState === undefined) {
            logServerAction("store", "submit_bot_step_not_found", {
                gameId,
                playerId,
                errorCode: GameErrorCode.GAME_NOT_FOUND,
                success: false,
            });
            return {
                success: false,
                errorCode: GameErrorCode.GAME_NOT_FOUND,
                errorMessage: "对局不存在",
            };
        }
        /** 游戏核心只推进一个机器人动作，让前端可以逐步展示过程。 */
        const result = applyBotActionStep(gameState);
        if (!result.success || result.gameState === undefined) {
            logServerAction("store", "submit_bot_step_failed", {
                gameId,
                playerId,
                phase: gameState.phase,
                errorCode: result.errorCode,
                errorMessage: result.errorMessage,
                success: false,
            });
            await actionLogRepository.appendActionLog({
                gameId,
                playerId,
                events: result.events,
                success: false,
                errorCode: result.errorCode,
                errorMessage: result.errorMessage,
            });
            return {
                success: false,
                errorCode: result.errorCode,
                errorMessage: result.errorMessage,
            };
        }
        const updatedGameState = advanceGameVersion(result.gameState);
        gameRepository.saveGame(updatedGameState);
        const actionLogEntry = {
            gameId,
            playerId,
            events: result.events,
            success: true,
            errorCode: GameErrorCode.NONE,
            errorMessage: "",
        };
        await persistSuccessfulActionWithoutBlockingGame(
            "保存机器人成功动作",
            updatedGameState,
            actionLogEntry,
        );
        logServerAction("store", "submit_bot_step_saved", {
            gameId,
            playerId,
            phase: updatedGameState.phase,
            stateVersion: updatedGameState.stateVersion,
            deckCount: updatedGameState.deck.length,
            tablePairCount: updatedGameState.tablePairs.length,
            actions: result.events.length,
            success: true,
        });
        return {
            success: true,
            data: {
                viewState: createPlayerView(updatedGameState, playerId),
                events: result.events,
                hasPendingBotAction: hasPendingBotAction(updatedGameState),
            },
            errorCode: GameErrorCode.NONE,
            errorMessage: "",
        };
    }

    /**
     * 将同一对局的修改操作排队执行，不限制不同对局并行处理。
     */
    async function enqueueGameMutation<T>(
        gameId: string,
        mutation: () => Promise<T>,
    ): Promise<T> {
        const previousQueue = mutationQueues.get(gameId) ?? Promise.resolve();
        const nextQueue = previousQueue.catch(() => undefined).then(mutation);
        const queueTail = nextQueue.then(
            () => undefined,
            () => undefined,
        );
        mutationQueues.set(gameId, queueTail);
        queueTail.finally(() => {
            if (mutationQueues.get(gameId) === queueTail) {
                mutationQueues.delete(gameId);
            }
        });
        return nextQueue;
    }

    return {
        createStoredGame,
        getStoredGameView,
        getStoredGameParticipant,
        getStoredGameResult,
        listStoredGameActionLogs,
        listStoredGameRecords,
        submitStoredGameAction,
        submitStoredBotStep,
        finishStoredGame,
    };

    /**
     * 查询最近对局主记录，供记录接口和数据库接入验证使用。
     */
    async function listStoredGameRecords(input: ListGameRecordsInput) {
        return recordRepository.listGameRecords(input);
    }

    /**
     * 判断指定用户是否是对局参与者，供路由层做资源权限校验。
     */
    async function getStoredGameParticipant(
        gameId: string,
        userId: string,
    ): Promise<GameParticipantResult> {
        const gameState = await getReadableGameState(gameId);
        if (gameState === undefined) {
            return {
                gameExists: false,
                isParticipant: false,
            };
        }
        return {
            gameExists: true,
            isParticipant: gameState.players.some(
                (player) => player.playerId === userId,
            ),
        };
    }

    /**
     * 查询指定对局的最终结果。
     */
    async function getStoredGameResult(gameId: string) {
        return recordRepository.getGameResult(gameId);
    }

    /**
     * 查询指定对局的动作日志，新日志排在前面。
     */
    async function listStoredGameActionLogs(gameId: string, limit: number) {
        return actionLogRepository.listActionLogs(gameId, limit);
    }

    /**
     * 读取可用于路由层权限判断的对局状态，内存缺失时复用快照恢复能力。
     */
    async function getReadableGameState(gameId: string) {
        const gameState = gameRepository.getGame(gameId);
        return gameState ?? restoreGameFromSnapshot(gameId);
    }

    /**
     * 同一客户端动作已经落过日志时，直接还原上次结果，不再重复执行规则。
     */
    async function getRepeatedActionResult(
        gameState: GameState,
        playerId: string,
        clientActionId?: string,
    ): Promise<StoreResult | undefined> {
        if (clientActionId === undefined) {
            return undefined;
        }
        const actionLog =
            await actionLogRepository.getActionLogByClientActionId(
                gameState.gameId,
                clientActionId,
            );
        if (actionLog === undefined) {
            return undefined;
        }
        logServerAction("store", "submit_action_repeated", {
            gameId: gameState.gameId,
            playerId,
            clientActionId,
            roundAction: actionLog.actionType,
            success: actionLog.success,
        });
        return createRepeatedActionResult({
            gameState,
            playerId,
            actionLog,
        });
    }

    /**
     * 内存状态缺失时尝试从数据库快照恢复。
     */
    async function restoreGameFromSnapshot(gameId: string) {
        const snapshot = await snapshotRepository.getLatestSnapshot(gameId);
        if (snapshot !== undefined) {
            const restoredSnapshot = ensureGameVersion(snapshot);
            gameRepository.saveGame(restoredSnapshot);
            logServerAction("store", "restore_game_snapshot", {
                gameId,
                phase: restoredSnapshot.phase,
                stateVersion: restoredSnapshot.stateVersion,
                deckCount: restoredSnapshot.deck.length,
                tablePairCount: restoredSnapshot.tablePairs.length,
                success: true,
            });
            return restoredSnapshot;
        }
        return undefined;
    }

    /**
     * 创建对局优先走事务型持久化仓库，未配置时退回原有分步写入。
     */
    async function persistCreatedGameWithoutBlockingGame(
        gameState: GameState,
        roomId: string | undefined,
        mode: GameMode | undefined,
        localUser: { userId: string; nickname: string },
        actionLogEntry: Parameters<
            GameCreationPersistenceRepository["persistCreatedGame"]
        >[0]["actionLogEntry"],
    ): Promise<void> {
        await persistWithoutBlockingGame("保存新对局初始数据", async () => {
            if (creationPersistenceRepository !== undefined) {
                await creationPersistenceRepository.persistCreatedGame({
                    gameState,
                    ...(roomId === undefined ? {} : { roomId }),
                    ...(mode === undefined ? {} : { mode }),
                    localUser,
                    actionLogEntry,
                });
                return;
            }
            await recordRepository.upsertLocalUser(localUser);
            await recordRepository.createGameRecord(gameState, {
                ...(roomId === undefined ? {} : { roomId }),
                ...(mode === undefined ? {} : { mode }),
            });
            await snapshotRepository.saveLatestSnapshot(gameState);
            await actionLogRepository.appendActionLog(actionLogEntry);
        });
    }

    /**
     * 成功动作优先走事务型持久化仓库，未配置时退回原有分步写入。
     */
    async function persistSuccessfulActionWithoutBlockingGame(
        action: string,
        gameState: GameState,
        actionLogEntry: Parameters<
            GameActionPersistenceRepository["persistSuccessfulAction"]
        >[0]["actionLogEntry"],
    ): Promise<void> {
        await persistWithoutBlockingGame(action, async () => {
            if (actionPersistenceRepository !== undefined) {
                await actionPersistenceRepository.persistSuccessfulAction({
                    gameState,
                    actionLogEntry,
                });
                return;
            }
            await recordRepository.updateGameRecord(gameState);
            await snapshotRepository.saveLatestSnapshot(gameState);
            await actionLogRepository.appendActionLog(actionLogEntry);
        });
    }

    /**
     * 主动结束人机局使用独立持久化路径，不触发正常对局结果和战绩统计。
     */
    async function persistFinishedGameWithoutBlockingGame(
        gameState: GameState,
        finishReason: GameFinishReason,
        actionLogEntry: Parameters<
            GameActionLogRepository["appendActionLog"]
        >[0],
    ): Promise<void> {
        await persistWithoutBlockingGame("保存主动结束对局", async () => {
            await recordRepository.finishGameRecord(gameState, {
                finishReason,
            });
            await snapshotRepository.saveLatestSnapshot(gameState);
            await actionLogRepository.appendActionLog(actionLogEntry);
        });
    }
}

/**
 * 成功动作生成的新状态继承旧状态版本，服务层统一递增以避免规则层关心持久化版本。
 */
function advanceGameVersion(gameState: GameState): GameState {
    const currentState = ensureGameVersion(gameState);
    return {
        ...currentState,
        stateVersion: currentState.stateVersion + 1,
    };
}

/**
 * 兼容旧快照中没有版本字段的情况，避免历史数据恢复后版本校验出现 NaN。
 */
function ensureGameVersion<T extends { stateVersion?: number }>(
    gameState: T,
): T & { stateVersion: number } {
    return {
        ...gameState,
        stateVersion:
            typeof gameState.stateVersion === "number"
                ? gameState.stateVersion
                : 0,
    };
}

/**
 * 从重复动作日志还原接口结果，确保相同 `clientActionId` 不会再次执行规则。
 */
async function createRepeatedActionResult(input: {
    gameState: GameState;
    playerId: string;
    actionLog: GameActionRecordDTO;
}): Promise<StoreResult> {
    const errorCode = parseGameErrorCode(input.actionLog.errorCode);
    const events = parseGameEvents(input.actionLog.eventJson);
    if (!input.actionLog.success) {
        return {
            success: false,
            errorCode,
            errorMessage: input.actionLog.errorMessage ?? "动作重复提交失败",
        };
    }
    return {
        success: true,
        data: {
            viewState: createPlayerView(input.gameState, input.playerId),
            events,
            hasPendingBotAction: hasPendingBotAction(input.gameState),
        },
        errorCode: GameErrorCode.NONE,
        errorMessage: "",
    };
}

/**
 * 解析日志中的事件 JSON，异常结构按空事件处理，避免重复请求再次执行动作。
 */
function parseGameEvents(value: unknown): GameEventDTO[] {
    return Array.isArray(value) ? (value as GameEventDTO[]) : [];
}

/**
 * 将日志错误码还原为共享错误枚举，不认识的历史值按状态不一致处理。
 */
function parseGameErrorCode(errorCode: string | undefined): GameErrorCode {
    if (errorCode === undefined || errorCode.length === 0) {
        return GameErrorCode.NONE;
    }
    return Object.values(GameErrorCode).includes(errorCode as GameErrorCode)
        ? (errorCode as GameErrorCode)
        : GameErrorCode.STATE_INCONSISTENT;
}

/**
 * 执行可选数据库持久化，失败时只记录中文日志，不中断当前内存对局。
 */
async function persistWithoutBlockingGame(
    action: string,
    persist: () => Promise<void>,
): Promise<void> {
    try {
        await persist();
    } catch (error) {
        logServerAction("store", action, {
            success: false,
            errorMessage:
                error instanceof Error ? error.message : "数据库持久化失败",
        });
    }
}

/**
 * 生成当前单机模式使用的默认玩家身份，后续可替换为账号和房间服务。
 */
function createDefaultPlayerIdentities(
    playerCount: number,
    currentPlayerId: string,
    currentPlayerName = "我",
): PlayerIdentityDTO[] {
    return Array.from({ length: playerCount }, (_, seat) => {
        /** 首位玩家仍代表当前真人，其余座位先使用可持久化的临时机器人账号。 */
        const isCurrentPlayer = seat === 0;
        return {
            playerId: isCurrentPlayer
                ? currentPlayerId
                : `bot-player-${seat + 1}`,
            accountId: isCurrentPlayer
                ? `local-account-${currentPlayerId}`
                : `bot-account-${seat + 1}`,
            seat,
            name: isCurrentPlayer ? currentPlayerName : `机器人${seat + 1}`,
            playerType: isCurrentPlayer ? PlayerType.HUMAN : PlayerType.BOT,
            ...(isCurrentPlayer
                ? {}
                : { botProfileId: `default-bot-${seat + 1}` }),
        };
    });
}
