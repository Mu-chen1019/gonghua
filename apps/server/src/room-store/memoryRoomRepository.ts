/**
 * 内存房间仓库模块。
 *
 * 本文件用于未配置数据库的开发和测试环境，保证房间接口可用但不持久化。
 * 行为与 Prisma 仓库保持同样语义，便于后续路由测试不依赖真实数据库。
 */
import { randomUUID } from "node:crypto";
import { PlayerType } from "@gonghua/contracts";
import type { RoomDTO } from "@gonghua/contracts";
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

/** 玩家在线状态。 */
const ONLINE_STATUS = "ONLINE";

/** 玩家离线状态。 */
const OFFLINE_STATUS = "OFFLINE";

/**
 * 内存实现的房间仓库。
 */
export class MemoryRoomRepository implements RoomRepository {
    /** 内存房间快照表。 */
    private readonly rooms = new Map<string, RoomDTO>();

    /**
     * 创建房间并自动加入房主。
     */
    async createRoom(input: CreateStoredRoomInput): Promise<RoomDTO> {
        const now = new Date().toISOString();
        const roomId = randomUUID();
        const ownerNickname = input.ownerNickname ?? "房主";
        const room: RoomDTO = {
            id: roomId,
            roomCode: createRoomCode(),
            ownerUserId: input.ownerUserId,
            status: ROOM_STATUS_OPEN,
            playerCount: input.playerCount,
            botFillEnabled: input.botFillEnabled ?? true,
            createdAt: now,
            updatedAt: now,
            players: [
                {
                    id: randomUUID(),
                    roomId,
                    userId: input.ownerUserId,
                    nickname: ownerNickname,
                    seat: 0,
                    playerType: PlayerType.HUMAN,
                    ready: false,
                    onlineStatus: ONLINE_STATUS,
                    joinedAt: now,
                },
            ],
        };
        this.rooms.set(roomId, room);
        return room;
    }

    /**
     * 查询房间快照。
     */
    async getRoom(roomId: string): Promise<RoomDTO | undefined> {
        return this.rooms.get(roomId);
    }

    /**
     * 加入房间，优先复用玩家原有座位。
     */
    async joinRoom(
        roomId: string,
        input: JoinStoredRoomInput,
    ): Promise<RoomDTO> {
        const room = getExistingRoom(this.rooms, roomId);
        ensureRoomOpen(room);
        const now = new Date().toISOString();
        const nickname =
            input.nickname ??
            (input.playerType === PlayerType.BOT ? "机器人" : "玩家");
        const existingPlayer = room.players.find(
            (player) => player.userId === input.userId,
        );
        if (existingPlayer !== undefined) {
            delete existingPlayer.leftAt;
            existingPlayer.nickname = nickname;
            existingPlayer.onlineStatus = ONLINE_STATUS;
            room.updatedAt = now;
            return room;
        }
        const seat = findAvailableSeat(room);
        room.players.push({
            id: randomUUID(),
            roomId,
            userId: input.userId,
            nickname,
            seat,
            playerType: input.playerType ?? PlayerType.HUMAN,
            ready: false,
            onlineStatus: ONLINE_STATUS,
            joinedAt: now,
        });
        room.updatedAt = now;
        return room;
    }

    /**
     * 按房间号加入房间，房间号只作为查找入口，实际成员变更复用房间标识加入逻辑。
     */
    async joinRoomByCode(
        roomCode: string,
        input: JoinStoredRoomInput,
    ): Promise<RoomDTO> {
        const normalizedRoomCode = normalizeRoomCode(roomCode);
        const room = Array.from(this.rooms.values()).find(
            (item) => item.roomCode === normalizedRoomCode,
        );
        if (room === undefined) {
            throw new Error("房间不存在");
        }
        return this.joinRoom(room.id, input);
    }

    /**
     * 离开房间，保留成员记录用于后续排查。
     */
    async leaveRoom(roomId: string, userId: string): Promise<RoomDTO> {
        const room = getExistingRoom(this.rooms, roomId);
        const player = room.players.find((player) => player.userId === userId);
        if (player === undefined) {
            throw new Error("房间成员不存在");
        }
        const now = new Date().toISOString();
        player.ready = false;
        player.onlineStatus = OFFLINE_STATUS;
        player.leftAt = now;
        room.updatedAt = now;
        closeOpenRoomWhenEmpty(room, now);
        return room;
    }

    /**
     * 更新房间成员准备状态。
     */
    async setReady(roomId: string, input: SetRoomReadyInput): Promise<RoomDTO> {
        const room = getExistingRoom(this.rooms, roomId);
        ensureRoomOpen(room);
        const player = room.players.find(
            (player) => player.userId === input.userId,
        );
        if (player === undefined || player.leftAt !== undefined) {
            throw new Error("房间成员不存在");
        }
        player.ready = input.ready;
        room.updatedAt = new Date().toISOString();
        return room;
    }

    /**
     * 标记房间已经开始对局。
     */
    async markStarted(roomId: string, currentGameId: string): Promise<RoomDTO> {
        const room = getExistingRoom(this.rooms, roomId);
        room.status = ROOM_STATUS_STARTED;
        room.currentGameId = currentGameId;
        room.updatedAt = new Date().toISOString();
        return room;
    }

    /**
     * 关闭房间。
     */
    async closeRoom(roomId: string): Promise<RoomDTO> {
        const room = getExistingRoom(this.rooms, roomId);
        const now = new Date().toISOString();
        room.status = ROOM_STATUS_CLOSED;
        room.closedAt = now;
        room.updatedAt = now;
        return room;
    }
}

/**
 * 查询已存在房间，不存在时抛出业务错误。
 */
function getExistingRoom(rooms: Map<string, RoomDTO>, roomId: string): RoomDTO {
    const room = rooms.get(roomId);
    if (room === undefined) {
        throw new Error("房间不存在");
    }
    return room;
}

/**
 * 统一房间号格式，避免用户输入大小写或前后空格导致无法加入。
 */
function normalizeRoomCode(roomCode: string): string {
    return roomCode.trim().toUpperCase();
}

/**
 * 校验房间仍处于可加入和准备状态，已开始或已关闭的房间只能查看不能继续变更成员。
 */
function ensureRoomOpen(room: RoomDTO): void {
    if (room.status !== ROOM_STATUS_OPEN) {
        throw new Error(
            room.status === ROOM_STATUS_STARTED ? "房间已开始" : "房间已关闭",
        );
    }
}

/**
 * 未开始房间所有成员离开后自动关闭，保留房间记录供排查而不是物理删除。
 */
function closeOpenRoomWhenEmpty(room: RoomDTO, closedAt: string): void {
    const hasActivePlayer = room.players.some(
        (player) => player.leftAt === undefined,
    );
    if (room.status === ROOM_STATUS_OPEN && !hasActivePlayer) {
        room.status = ROOM_STATUS_CLOSED;
        room.closedAt = closedAt;
        room.updatedAt = closedAt;
    }
}

/**
 * 查找房间空座位，房间满员时抛出错误。
 */
function findAvailableSeat(room: RoomDTO): number {
    const activeSeats = new Set(
        room.players
            .filter((player) => player.leftAt === undefined)
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
 * 生成本地房间号，正式联机阶段再加入冲突重试策略。
 */
function createRoomCode(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}
