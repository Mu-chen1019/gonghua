/**
 * Prisma 房间仓库模块。
 *
 * 本文件负责 `Room` 和 `RoomPlayer` 表的读写，提供房间创建、加入、离开、准备和关闭能力。
 * 房间仓库不启动对局，也不处理游戏规则。
 */
import { PlayerType } from "@gonghua/contracts";
import type { RoomDTO, RoomPlayerDTO } from "@gonghua/contracts";
import { getPrismaClient } from "../db/prisma";
import type {
    CreateStoredRoomInput,
    JoinStoredRoomInput,
    RoomRepository,
    SetRoomReadyInput,
} from "./types";

/** 房间开启状态。 */
const ROOM_STATUS_OPEN = "OPEN";

/** 房间关闭状态。 */
const ROOM_STATUS_CLOSED = "CLOSED";

/** 房间已开始对局状态。 */
const ROOM_STATUS_STARTED = "STARTED";

/** 运行中对局状态，房间快照用它推导当前可进入的对局。 */
const ACTIVE_GAME_STATUS = "ACTIVE";

/** 玩家在线状态。 */
const ONLINE_STATUS = "ONLINE";

/** 玩家离线状态。 */
const OFFLINE_STATUS = "OFFLINE";

/**
 * Prisma 实现的房间仓库。
 */
export class PrismaRoomRepository implements RoomRepository {
    /**
     * 创建房间并自动把房主加入 0 号座位。
     */
    async createRoom(input: CreateStoredRoomInput): Promise<RoomDTO> {
        const prisma = getPrismaClient();
        await ensureUser(input.ownerUserId, input.ownerNickname ?? "房主");
        const room = await prisma.room.create({
            data: {
                roomCode: createRoomCode(),
                ownerUserId: input.ownerUserId,
                status: ROOM_STATUS_OPEN,
                playerCount: input.playerCount,
                botFillEnabled: input.botFillEnabled ?? true,
                players: {
                    create: {
                        userId: input.ownerUserId,
                        seat: 0,
                        playerType: PlayerType.HUMAN,
                    },
                },
            },
            include: createRoomInclude(),
        });
        return toRoomDTO(room);
    }

    /**
     * 查询房间快照。
     */
    async getRoom(roomId: string): Promise<RoomDTO | undefined> {
        const prisma = getPrismaClient();
        const room = await prisma.room.findUnique({
            where: { id: roomId },
            include: createRoomInclude(),
        });
        return room === null ? undefined : toRoomDTO(room);
    }

    /**
     * 加入房间，重复加入时恢复在线状态。
     */
    async joinRoom(
        roomId: string,
        input: JoinStoredRoomInput,
    ): Promise<RoomDTO> {
        const prisma = getPrismaClient();
        await ensureUser(
            input.userId,
            input.nickname ??
                (input.playerType === PlayerType.BOT ? "机器人" : "玩家"),
        );
        return prisma.$transaction(async (tx) => {
            const room = await tx.room.findUnique({
                where: { id: roomId },
                include: createRoomInclude(),
            });
            if (room === null) {
                throw new Error("房间不存在");
            }
            ensureRoomOpen(room.status);
            const existingPlayer = room.players.find(
                (player) => player.userId === input.userId,
            );
            if (existingPlayer !== undefined) {
                await tx.roomPlayer.update({
                    where: { id: existingPlayer.id },
                    data: {
                        onlineStatus: ONLINE_STATUS,
                        leftAt: null,
                    },
                });
            } else {
                await tx.roomPlayer.create({
                    data: {
                        roomId,
                        userId: input.userId,
                        seat: findAvailableSeat(room),
                        playerType: input.playerType ?? PlayerType.HUMAN,
                    },
                });
            }
            const updatedRoom = await tx.room.update({
                where: { id: roomId },
                data: {},
                include: createRoomInclude(),
            });
            return toRoomDTO(updatedRoom);
        });
    }

    /**
     * 按房间号加入房间，房间号只负责定位真实房间主键。
     */
    async joinRoomByCode(
        roomCode: string,
        input: JoinStoredRoomInput,
    ): Promise<RoomDTO> {
        const prisma = getPrismaClient();
        const room = await prisma.room.findUnique({
            where: { roomCode: normalizeRoomCode(roomCode) },
            select: { id: true },
        });
        if (room === null) {
            throw new Error("房间不存在");
        }
        return this.joinRoom(room.id, input);
    }

    /**
     * 离开房间，保留成员记录并标记离线。
     */
    async leaveRoom(roomId: string, userId: string): Promise<RoomDTO> {
        const prisma = getPrismaClient();
        return prisma.$transaction(async (tx) => {
            const player = await tx.roomPlayer.findUnique({
                where: {
                    roomId_userId: {
                        roomId,
                        userId,
                    },
                },
            });
            if (player === null) {
                throw new Error("房间成员不存在");
            }
            await tx.roomPlayer.update({
                where: { id: player.id },
                data: {
                    ready: false,
                    onlineStatus: OFFLINE_STATUS,
                    leftAt: new Date(),
                },
            });
            const room = await tx.room.update({
                where: { id: roomId },
                data: {},
                include: createRoomInclude(),
            });
            if (shouldCloseOpenRoomWhenEmpty(room)) {
                const closedRoom = await tx.room.update({
                    where: { id: roomId },
                    data: {
                        status: ROOM_STATUS_CLOSED,
                        closedAt: new Date(),
                    },
                    include: createRoomInclude(),
                });
                return toRoomDTO(closedRoom);
            }
            return toRoomDTO(room);
        });
    }

    /**
     * 更新房间成员准备状态。
     */
    async setReady(roomId: string, input: SetRoomReadyInput): Promise<RoomDTO> {
        const prisma = getPrismaClient();
        return prisma.$transaction(async (tx) => {
            const player = await tx.roomPlayer.findUnique({
                where: {
                    roomId_userId: {
                        roomId,
                        userId: input.userId,
                    },
                },
            });
            if (player === null || player.leftAt !== null) {
                throw new Error("房间成员不存在");
            }
            const roomBeforeUpdate = await tx.room.findUnique({
                where: { id: roomId },
                select: { status: true },
            });
            if (roomBeforeUpdate === null) {
                throw new Error("房间不存在");
            }
            ensureRoomOpen(roomBeforeUpdate.status);
            await tx.roomPlayer.update({
                where: { id: player.id },
                data: { ready: input.ready },
            });
            const room = await tx.room.update({
                where: { id: roomId },
                data: {},
                include: createRoomInclude(),
            });
            return toRoomDTO(room);
        });
    }

    /**
     * 标记房间已经开始对局。
     */
    async markStarted(roomId: string, currentGameId: string): Promise<RoomDTO> {
        const prisma = getPrismaClient();
        const room = await prisma.room.update({
            where: { id: roomId },
            data: {
                status: ROOM_STATUS_STARTED,
            },
            include: createRoomInclude(),
        });
        return { ...toRoomDTO(room), currentGameId };
    }

    /**
     * 关闭房间。
     */
    async closeRoom(roomId: string): Promise<RoomDTO> {
        const prisma = getPrismaClient();
        const room = await prisma.room.update({
            where: { id: roomId },
            data: {
                status: ROOM_STATUS_CLOSED,
                closedAt: new Date(),
            },
            include: createRoomInclude(),
        });
        return toRoomDTO(room);
    }
}

/**
 * 确保房间相关用户存在，当前本地阶段用默认昵称补齐。
 */
async function ensureUser(userId: string, nickname: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: {
            id: userId,
            nickname,
        },
    });
}

/**
 * 校验房间仍处于可加入和准备状态，已开始或已关闭的房间不允许继续变更成员。
 */
function ensureRoomOpen(roomStatus: string): void {
    if (roomStatus !== ROOM_STATUS_OPEN) {
        throw new Error(
            roomStatus === ROOM_STATUS_STARTED ? "房间已开始" : "房间已关闭",
        );
    }
}

/**
 * 统一房间号格式，避免用户输入大小写或前后空格导致无法加入。
 */
function normalizeRoomCode(roomCode: string): string {
    return roomCode.trim().toUpperCase();
}

/**
 * 判断未开始房间是否已经没有在线成员，需要软关闭而不是物理删除。
 */
function shouldCloseOpenRoomWhenEmpty(room: {
    status: string;
    players: Array<{ leftAt: Date | null }>;
}): boolean {
    return (
        room.status === ROOM_STATUS_OPEN &&
        room.players.every((player) => player.leftAt !== null)
    );
}

/**
 * 查找房间空座位，房间满员时抛出错误。
 */
function findAvailableSeat(room: {
    playerCount: number;
    players: Array<{ seat: number; leftAt: Date | null }>;
}): number {
    const activeSeats = new Set(
        room.players
            .filter((player) => player.leftAt === null)
            .map((player) => player.seat),
    );
    for (let seat = 0; seat < room.playerCount; seat += 1) {
        if (!activeSeats.has(seat)) {
            return seat;
        }
    }
    throw new Error("房间已满");
}

/**
 * 生成房间号，正式联机阶段再加入数据库冲突重试策略。
 */
function createRoomCode(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/**
 * 房间查询统一带出成员用户昵称，避免路由层为了展示名称直接访问 Prisma。
 */
function createRoomInclude() {
    return {
        games: {
            where: { status: ACTIVE_GAME_STATUS },
            orderBy: { createdAt: "desc" },
            take: 1,
        },
        players: {
            orderBy: { seat: "asc" },
            include: { user: true },
        },
    } as const;
}

/**
 * 把 Prisma 房间记录转换为接口响应 DTO。
 */
function toRoomDTO(room: {
    id: string;
    roomCode: string;
    ownerUserId: string;
    status: string;
    playerCount: number;
    botFillEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    closedAt: Date | null;
    games?: Array<{
        id: string;
    }>;
    players: Array<{
        id: string;
        roomId: string;
        userId: string;
        seat: number;
        playerType: string;
        ready: boolean;
        onlineStatus: string;
        joinedAt: Date;
        leftAt: Date | null;
        user?: {
            nickname: string;
        };
    }>;
}): RoomDTO {
    return {
        id: room.id,
        roomCode: room.roomCode,
        ownerUserId: room.ownerUserId,
        ...(room.games === undefined || room.games[0] === undefined
            ? {}
            : { currentGameId: room.games[0].id }),
        status: room.status,
        playerCount: room.playerCount,
        botFillEnabled: room.botFillEnabled,
        createdAt: room.createdAt.toISOString(),
        updatedAt: room.updatedAt.toISOString(),
        ...(room.closedAt === null
            ? {}
            : { closedAt: room.closedAt.toISOString() }),
        players: room.players.map(toRoomPlayerDTO),
    };
}

/**
 * 把 Prisma 房间成员记录转换为接口响应 DTO。
 */
function toRoomPlayerDTO(player: {
    id: string;
    roomId: string;
    userId: string;
    seat: number;
    playerType: string;
    ready: boolean;
    onlineStatus: string;
    joinedAt: Date;
    leftAt: Date | null;
    user?: {
        nickname: string;
    };
}): RoomPlayerDTO {
    return {
        id: player.id,
        roomId: player.roomId,
        userId: player.userId,
        ...(player.user === undefined
            ? {}
            : { nickname: player.user.nickname }),
        seat: player.seat,
        playerType: player.playerType,
        ready: player.ready,
        onlineStatus: player.onlineStatus,
        joinedAt: player.joinedAt.toISOString(),
        ...(player.leftAt === null
            ? {}
            : { leftAt: player.leftAt.toISOString() }),
    };
}
