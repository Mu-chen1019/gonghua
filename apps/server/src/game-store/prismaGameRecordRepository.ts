/**
 * Prisma 对局记录仓库模块。
 *
 * 本文件负责落库用户主表、对局主表、对局玩家关系、对局结果和玩家统计。
 * 完整牌面运行态仍由服务端内存和快照仓库承载，本仓库只同步生命周期、阶段和状态版本。
 */
import type { Prisma } from "@prisma/client";
import {
    GameFinishReason,
    GameMode,
    GamePhase,
    PlayerType,
} from "@gonghua/contracts";
import type { GameRecordDTO, GameResultDTO } from "@gonghua/contracts";
import type { GameState, PlayerState } from "@gonghua/game-core";
import { getPrismaClient } from "../db/prisma";
import type {
    CreateGameRecordInput,
    FinishGameRecordInput,
    GameRecordRepository,
    ListGameRecordsInput,
    LocalUserRecordInput,
} from "./types";

/** 运行中对局状态值，当前先与数据库 status 字符串字段保持解耦。 */
const ACTIVE_GAME_STATUS = "ACTIVE";

/** 已结束对局状态值，对应核心状态机 GAME_OVER 阶段。 */
const FINISHED_GAME_STATUS = "FINISHED";

/**
 * Prisma 实现的对局记录仓库。
 */
export class PrismaGameRecordRepository implements GameRecordRepository {
    /**
     * 创建或更新当前本地用户，避免重复创建同一个 currentPlayerId。
     */
    async upsertLocalUser(input: LocalUserRecordInput): Promise<void> {
        const prisma = getPrismaClient();
        await prisma.user.upsert({
            where: { id: input.userId },
            update:
                input.avatarUrl === undefined
                    ? {}
                    : { avatarUrl: input.avatarUrl },
            create: {
                id: input.userId,
                nickname: input.nickname,
                ...(input.avatarUrl === undefined
                    ? {}
                    : { avatarUrl: input.avatarUrl }),
            },
        });
    }

    /**
     * 创建对局主记录和对局玩家关系，当前不保存手牌和桌面状态。
     */
    async createGameRecord(
        gameState: GameState,
        input: CreateGameRecordInput = {},
    ): Promise<void> {
        const prisma = getPrismaClient();
        await prisma.$transaction(async (tx) =>
            createGameRecordInTransaction(tx, gameState, input),
        );
    }

    /**
     * 更新对局主记录阶段、状态版本和结束时间。
     */
    async updateGameRecord(gameState: GameState): Promise<void> {
        const prisma = getPrismaClient();
        await prisma.$transaction(async (tx) =>
            updateGameRecordInTransaction(tx, gameState),
        );
    }

    /**
     * 主动结束对局主记录，只更新生命周期字段，不生成胜负结果和战绩统计。
     */
    async finishGameRecord(
        gameState: GameState,
        input: FinishGameRecordInput,
    ): Promise<void> {
        const prisma = getPrismaClient();
        await prisma.$transaction(async (tx) =>
            finishGameRecordInTransaction(tx, gameState, input),
        );
    }

    /**
     * 同步对局玩家关系，主要用于后续补录或单独修复玩家关系数据。
     */
    async syncGamePlayers(gameState: GameState): Promise<void> {
        const prisma = getPrismaClient();
        await prisma.$transaction(async (tx) => {
            await Promise.all(
                gameState.players.map((player) =>
                    tx.user.upsert({
                        where: { id: resolveUserId(player) },
                        update: toUserUpdateInput(player),
                        create: toUserCreateInput(player),
                    }),
                ),
            );
            await Promise.all(
                gameState.players.map((player) =>
                    tx.gamePlayer.upsert({
                        where: {
                            gameId_seat: {
                                gameId: gameState.gameId,
                                seat: player.seat,
                            },
                        },
                        update: toGamePlayerUpdateInput(player),
                        create: {
                            gameId: gameState.gameId,
                            ...toGamePlayerCreateInput(player),
                        },
                    }),
                ),
            );
        });
    }

    /**
     * 查询最近对局主记录，默认给后续记录页和调试接口使用。
     */
    async listGameRecords(
        input: ListGameRecordsInput,
    ): Promise<GameRecordDTO[]> {
        const prisma = getPrismaClient();
        const records = await prisma.game.findMany({
            ...(input.userId === undefined
                ? {}
                : {
                      where: {
                          players: {
                              some: {
                                  userId: input.userId,
                              },
                          },
                      },
                  }),
            orderBy: { createdAt: "desc" },
            take: input.limit,
        });
        return records.map(toGameRecordDTO);
    }

    /**
     * 查询指定对局最终结果，未结束或未落库时返回空。
     */
    async getGameResult(gameId: string): Promise<GameResultDTO | undefined> {
        const prisma = getPrismaClient();
        const result = await prisma.gameResult.findUnique({
            where: { gameId },
        });
        return result === null ? undefined : toGameResultDTO(result);
    }
}

/**
 * 在外部事务中创建对局主记录和玩家关系。
 */
export async function createGameRecordInTransaction(
    tx: Prisma.TransactionClient,
    gameState: GameState,
    input: CreateGameRecordInput = {},
): Promise<void> {
    await Promise.all(
        gameState.players.map((player) =>
            tx.user.upsert({
                where: { id: resolveUserId(player) },
                update: toUserUpdateInput(player),
                create: toUserCreateInput(player),
            }),
        ),
    );
    await tx.game.create({
        data: {
            id: gameState.gameId,
            ...(input.roomId === undefined ? {} : { roomId: input.roomId }),
            mode: input.mode ?? gameState.config.mode ?? GameMode.NORMAL,
            status: resolveGameStatus(gameState),
            currentPhase: gameState.phase,
            stateVersion: gameState.stateVersion,
            players: {
                create: gameState.players.map(toGamePlayerCreateInput),
            },
        },
    });
}

/**
 * 在外部事务中同步对局主记录、玩家排名、对局结果和玩家统计。
 */
export async function updateGameRecordInTransaction(
    tx: Prisma.TransactionClient,
    gameState: GameState,
): Promise<void> {
    await tx.game.update({
        where: { id: gameState.gameId },
        data: {
            status: resolveGameStatus(gameState),
            currentPhase: gameState.phase,
            stateVersion: gameState.stateVersion,
            ...(gameState.phase === GamePhase.GAME_OVER
                ? {
                      finishReason: GameFinishReason.NORMAL_FINISH,
                      finishedAt: new Date(),
                  }
                : {}),
        },
    });
    await syncFinishedPlayers(tx, gameState);
    await createGameResultAndStatsIfNeeded(tx, gameState);
}

/**
 * 在外部事务中主动结束对局，只标记状态和原因，不写入正常排名结果。
 */
export async function finishGameRecordInTransaction(
    tx: Prisma.TransactionClient,
    gameState: GameState,
    input: FinishGameRecordInput,
): Promise<void> {
    await tx.game.update({
        where: { id: gameState.gameId },
        data: {
            status: FINISHED_GAME_STATUS,
            currentPhase: GamePhase.GAME_OVER,
            stateVersion: gameState.stateVersion,
            finishReason: input.finishReason,
            finishedAt: new Date(),
        },
    });
}

/**
 * 根据核心阶段转换对局主记录状态，暂不引入额外协议枚举。
 */
function resolveGameStatus(gameState: GameState): string {
    return gameState.phase === GamePhase.GAME_OVER
        ? FINISHED_GAME_STATUS
        : ACTIVE_GAME_STATUS;
}

/**
 * 当前阶段用户主键先使用对局内玩家标识，后续接账号体系后可改为真实账号标识。
 */
function resolveUserId(player: PlayerState): string {
    return player.playerId;
}

/**
 * 生成用户创建入参，新用户必须写入可展示昵称。
 */
export function toUserCreateInput(player: PlayerState) {
    return {
        id: resolveUserId(player),
        nickname: player.name,
        ...(player.avatarUrl === undefined
            ? {}
            : { avatarUrl: player.avatarUrl }),
    };
}

/**
 * 生成用户更新入参，真人账号已有昵称不能被本局“我”等展示名覆盖。
 */
export function toUserUpdateInput(player: PlayerState) {
    const avatarInput =
        player.avatarUrl === undefined ? {} : { avatarUrl: player.avatarUrl };
    if (resolvePlayerType(player) === PlayerType.HUMAN) {
        return avatarInput;
    }
    return {
        nickname: player.name,
        ...avatarInput,
    };
}

/**
 * 生成对局玩家关系创建入参，避免把完整手牌状态写入关系表。
 */
function toGamePlayerCreateInput(player: PlayerState) {
    return {
        userId: resolveUserId(player),
        seat: player.seat,
        playerType: resolvePlayerType(player),
        ...(player.rank === undefined ? {} : { finalRank: player.rank }),
        ...(player.rank === undefined ? {} : { finishedAt: new Date() }),
    };
}

/**
 * 生成对局玩家关系更新入参，只同步身份展示、玩家类型和已产生排名。
 */
function toGamePlayerUpdateInput(player: PlayerState) {
    return {
        userId: resolveUserId(player),
        seat: player.seat,
        playerType: resolvePlayerType(player),
        ...(player.rank === undefined ? {} : { finalRank: player.rank }),
        ...(player.rank === undefined ? {} : { finishedAt: new Date() }),
    };
}

/**
 * 解析玩家类型，兼容旧测试状态未显式保存 playerType 的情况。
 */
function resolvePlayerType(player: PlayerState): PlayerType {
    return (
        player.playerType ?? (player.isBot ? PlayerType.BOT : PlayerType.HUMAN)
    );
}

/**
 * 把已产生名次的玩家同步到数据库，未完成玩家保持空名次。
 */
async function syncFinishedPlayers(
    tx: Prisma.TransactionClient,
    gameState: GameState,
): Promise<void> {
    await Promise.all(
        gameState.players.map((player) => {
            const rank = player.rank;
            if (rank === undefined) {
                return Promise.resolve();
            }
            return tx.gamePlayer.updateMany({
                where: {
                    gameId: gameState.gameId,
                    userId: resolveUserId(player),
                    finalRank: null,
                },
                data: {
                    finalRank: rank,
                    finishedAt: new Date(),
                },
            });
        }),
    );
}

/**
 * 对局第一次结束时写入结果并更新玩家统计，避免重复更新导致统计翻倍。
 */
async function createGameResultAndStatsIfNeeded(
    tx: Prisma.TransactionClient,
    gameState: GameState,
): Promise<void> {
    if (gameState.phase !== GamePhase.GAME_OVER) {
        return;
    }
    const existingResult = await tx.gameResult.findUnique({
        where: { gameId: gameState.gameId },
    });
    if (existingResult !== null) {
        return;
    }
    const rankings = gameState.players
        .filter((player) => player.rank !== undefined)
        .map((player) => ({
            playerId: resolveUserId(player),
            seat: player.seat,
            name: player.name,
            rank: player.rank ?? 0,
        }))
        .sort((current, next) => current.rank - next.rank);
    const winner = rankings.find((ranking) => ranking.rank === 1);
    await tx.gameResult.create({
        data: {
            gameId: gameState.gameId,
            ...(winner === undefined ? {} : { winnerUserId: winner.playerId }),
            rankingsJson: rankings,
            scoreJson: {},
        },
    });
    await Promise.all(
        rankings.map(async (ranking) => {
            const stat = await tx.playerStat.findUnique({
                where: { userId: ranking.playerId },
            });
            if (stat === null) {
                await tx.playerStat.create({
                    data: {
                        userId: ranking.playerId,
                        totalGames: 1,
                        winGames: ranking.rank === 1 ? 1 : 0,
                        averageRank: ranking.rank,
                        lastGameAt: new Date(),
                    },
                });
                return;
            }
            const totalGames = stat.totalGames + 1;
            const averageRank =
                (stat.averageRank * stat.totalGames + ranking.rank) /
                totalGames;
            await tx.playerStat.update({
                where: { userId: ranking.playerId },
                data: {
                    totalGames,
                    winGames: stat.winGames + (ranking.rank === 1 ? 1 : 0),
                    averageRank,
                    lastGameAt: new Date(),
                },
            });
        }),
    );
}

/**
 * 把 Prisma Date 对象转换为前后端响应使用的 ISO 字符串。
 */
function toGameRecordDTO(record: {
    id: string;
    roomId: string | null;
    mode: string;
    status: string;
    currentPhase: string;
    stateVersion: number;
    finishReason: string | null;
    startedAt: Date;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}): GameRecordDTO {
    return {
        id: record.id,
        ...(record.roomId === null ? {} : { roomId: record.roomId }),
        mode: parseGameMode(record.mode),
        status: record.status,
        currentPhase: record.currentPhase,
        stateVersion: record.stateVersion,
        ...(record.finishReason === null
            ? {}
            : { finishReason: parseGameFinishReason(record.finishReason) }),
        startedAt: record.startedAt.toISOString(),
        ...(record.finishedAt === null
            ? {}
            : { finishedAt: record.finishedAt.toISOString() }),
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
    };
}

/**
 * 解析历史对局模式，未知值按普通对局兼容。
 */
function parseGameMode(mode: string): GameMode {
    return Object.values(GameMode).includes(mode as GameMode)
        ? (mode as GameMode)
        : GameMode.NORMAL;
}

/**
 * 解析历史结束原因，未知值按正常结束兼容。
 */
function parseGameFinishReason(reason: string): GameFinishReason {
    return Object.values(GameFinishReason).includes(reason as GameFinishReason)
        ? (reason as GameFinishReason)
        : GameFinishReason.NORMAL_FINISH;
}

/**
 * 把 Prisma 对局结果转换为接口响应 DTO。
 */
function toGameResultDTO(record: {
    gameId: string;
    winnerUserId: string | null;
    rankingsJson: Prisma.JsonValue;
    scoreJson: Prisma.JsonValue | null;
    createdAt: Date;
}): GameResultDTO {
    return {
        gameId: record.gameId,
        ...(record.winnerUserId === null
            ? {}
            : { winnerUserId: record.winnerUserId }),
        rankingsJson: record.rankingsJson,
        ...(record.scoreJson === null ? {} : { scoreJson: record.scoreJson }),
        createdAt: record.createdAt.toISOString(),
    };
}
