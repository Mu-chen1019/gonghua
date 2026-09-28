/**
 * 房间接口路由模块。
 *
 * 本文件负责房间创建、查询、加入、离开、准备和关闭的 HTTP 入口。
 * 房间路由不直接访问 Prisma，也不启动对局规则流程。
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { GameErrorCode, PlayerType } from "@gonghua/contracts";
import type {
    ApiResponse,
    JoinRoomByCodeDTO,
    PlayerIdentityDTO,
    RoomDTO,
    RoomPlayerDTO,
    RoomStartGameResponseDTO,
} from "@gonghua/contracts";
import { createStoredGame } from "../gameStore";
import {
    closeStoredRoom,
    createStoredRoom,
    getStoredRoom,
    joinStoredRoom,
    joinStoredRoomByCode,
    leaveStoredRoom,
    markStoredRoomStarted,
    setStoredRoomReady,
} from "../room-store";
import { logServerAction } from "../logger";
import { ensureSameUser, requireAuthenticatedUser } from "./authGuard";
import { ensureRoomParticipant } from "./resourceGuard";

/** 房间路径参数校验规则。 */
const roomParamsSchema = z.object({
    roomId: z.string().min(1),
});

/** 创建房间请求体校验规则。 */
const createRoomSchema = z.object({
    ownerUserId: z.string().min(1).optional(),
    playerCount: z.number().int().min(2).max(6),
    botFillEnabled: z.boolean().optional(),
});

/** 加入房间请求体校验规则。 */
const joinRoomSchema = z.object({
    userId: z.string().min(1).optional(),
    playerType: z.string().min(1).optional(),
});

/** 按房间号加入房间请求体校验规则。 */
const joinRoomByCodeSchema = z.object({
    roomCode: z.string().trim().min(1).max(16),
    playerType: z.string().min(1).optional(),
});

/** 离开房间请求体校验规则。 */
const leaveRoomSchema = z.object({
    userId: z.string().min(1).optional(),
});

/** 更新准备状态请求体校验规则。 */
const readyRoomSchema = z.object({
    userId: z.string().min(1).optional(),
    ready: z.boolean(),
});

/** 开始房间对局请求体校验规则。 */
const startRoomGameSchema = z.object({
    ownerUserId: z.string().min(1).optional(),
    seed: z.number().int().positive().optional(),
});

/** 房间开启状态。 */
const ROOM_STATUS_OPEN = "OPEN";

/**
 * 注册房间相关接口。
 */
export async function registerRoomRoutes(app: FastifyInstance): Promise<void> {
    app.post("/rooms", async (request, reply) => {
        /** 创建房间必须使用当前登录用户作为房主。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        const body = createRoomSchema.safeParse(request.body);
        if (!body.success) {
            return reply
                .status(400)
                .send(createErrorResponse("创建房间参数不合法"));
        }
        const ownerUserId = body.data.ownerUserId ?? authUser.id;
        if (!ensureSameUser(reply, authUser, ownerUserId)) {
            return;
        }
        /** 房间成员展示名以服务端账号昵称为准，避免前端传入伪造昵称。 */
        const room = await createStoredRoom({
            ownerUserId,
            playerCount: body.data.playerCount,
            ownerNickname: authUser.nickname,
            ...(body.data.botFillEnabled === undefined
                ? {}
                : { botFillEnabled: body.data.botFillEnabled }),
        });
        logServerAction("api", "create_room", {
            route: "POST /rooms",
            playerId: ownerUserId,
            success: true,
        });
        return reply.status(201).send(createSuccessResponse(room));
    });

    app.get("/rooms/:roomId", async (request, reply) => {
        /** 房间详情当前要求登录，成员级可见性后续联机阶段再细化。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        const params = roomParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply
                .status(400)
                .send(createErrorResponse("查询房间参数不合法"));
        }
        const room = await getStoredRoom(params.data.roomId);
        if (room === undefined) {
            return reply.status(404).send(createErrorResponse("房间不存在"));
        }
        if (!ensureRoomParticipant(reply, room, authUser)) {
            return;
        }
        return createSuccessResponse(room);
    });

    app.post("/rooms/:roomId/join", async (request, reply) => {
        /** 加入房间必须使用当前登录用户身份。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        const params = roomParamsSchema.safeParse(request.params);
        const body = joinRoomSchema.safeParse(request.body);
        if (!params.success || !body.success) {
            return reply
                .status(400)
                .send(createErrorResponse("加入房间参数不合法"));
        }
        const userId = body.data.userId ?? authUser.id;
        if (!ensureSameUser(reply, authUser, userId)) {
            return;
        }
        /** 加入者昵称同样从认证仓库解析，房间仓库只保存服务端可信名称。 */
        return sendRoomMutation(reply, async () =>
            joinStoredRoom(params.data.roomId, {
                userId,
                nickname: authUser.nickname,
                ...(body.data.playerType === undefined
                    ? {}
                    : { playerType: body.data.playerType }),
            }),
        );
    });

    app.post("/rooms/join-by-code", async (request, reply) => {
        /** 按房间号加入同样只能使用当前登录用户身份。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        const body = joinRoomByCodeSchema.safeParse(request.body);
        if (!body.success) {
            return reply
                .status(400)
                .send(createErrorResponse("按房间号加入参数不合法"));
        }
        const joinInput: JoinRoomByCodeDTO = {
            roomCode: normalizeRoomCode(body.data.roomCode),
            ...(body.data.playerType === undefined
                ? {}
                : { playerType: body.data.playerType }),
        };
        return sendRoomMutation(reply, async () =>
            joinStoredRoomByCode(joinInput.roomCode, {
                userId: authUser.id,
                nickname: authUser.nickname,
                ...(joinInput.playerType === undefined
                    ? {}
                    : { playerType: joinInput.playerType }),
            }),
        );
    });

    app.post("/rooms/:roomId/leave", async (request, reply) => {
        /** 离开房间只能操作当前登录用户自己的成员关系。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        const params = roomParamsSchema.safeParse(request.params);
        const body = leaveRoomSchema.safeParse(request.body);
        if (!params.success || !body.success) {
            return reply
                .status(400)
                .send(createErrorResponse("离开房间参数不合法"));
        }
        const userId = body.data.userId ?? authUser.id;
        if (!ensureSameUser(reply, authUser, userId)) {
            return;
        }
        return sendRoomMutation(reply, async () =>
            leaveStoredRoom(params.data.roomId, userId),
        );
    });

    app.post("/rooms/:roomId/ready", async (request, reply) => {
        /** 准备状态只能由当前登录用户本人修改。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        const params = roomParamsSchema.safeParse(request.params);
        const body = readyRoomSchema.safeParse(request.body);
        if (!params.success || !body.success) {
            return reply
                .status(400)
                .send(createErrorResponse("更新准备状态参数不合法"));
        }
        const userId = body.data.userId ?? authUser.id;
        if (!ensureSameUser(reply, authUser, userId)) {
            return;
        }
        return sendRoomMutation(reply, async () =>
            setStoredRoomReady(params.data.roomId, {
                userId,
                ready: body.data.ready,
            }),
        );
    });

    app.post("/rooms/:roomId/start", async (request, reply) => {
        /** 开始房间对局必须由当前登录房主发起。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        const params = roomParamsSchema.safeParse(request.params);
        const body = startRoomGameSchema.safeParse(request.body);
        if (!params.success || !body.success) {
            return reply
                .status(400)
                .send(createErrorResponse("开始对局参数不合法"));
        }
        const ownerUserId = body.data.ownerUserId ?? authUser.id;
        if (!ensureSameUser(reply, authUser, ownerUserId)) {
            return;
        }
        try {
            const room = await getStartedRoomInput(
                params.data.roomId,
                ownerUserId,
            );
            const players = createRoomPlayerIdentities(room);
            const gameResult = await createStoredGame({
                playerCount: room.playerCount,
                currentPlayerId: ownerUserId,
                roomId: room.id,
                players,
                ...(body.data.seed === undefined
                    ? {}
                    : { seed: body.data.seed }),
            });
            if (!gameResult.success || gameResult.data === undefined) {
                return reply
                    .status(400)
                    .send(
                        createErrorResponse(
                            gameResult.errorMessage || "房间开始对局失败",
                        ),
                    );
            }
            const startedRoom = await markStoredRoomStarted(
                room.id,
                gameResult.data.viewState.gameId,
            );
            logServerAction("api", "start_room_game", {
                route: "POST /rooms/:roomId/start",
                gameId: gameResult.data.viewState.gameId,
                playerId: ownerUserId,
                success: true,
            });
            return reply.status(201).send(
                createDataResponse<RoomStartGameResponseDTO>({
                    room: startedRoom,
                    game: gameResult.data,
                }),
            );
        } catch (error) {
            return reply
                .status(400)
                .send(
                    createErrorResponse(
                        error instanceof Error
                            ? error.message
                            : "房间开始对局失败",
                    ),
                );
        }
    });

    app.post("/rooms/:roomId/close", async (request, reply) => {
        /** 关闭房间必须登录，且只能由房主关闭。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        const params = roomParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply
                .status(400)
                .send(createErrorResponse("关闭房间参数不合法"));
        }
        const room = await getStoredRoom(params.data.roomId);
        if (room === undefined) {
            return reply.status(404).send(createErrorResponse("房间不存在"));
        }
        if (!ensureSameUser(reply, authUser, room.ownerUserId)) {
            return;
        }
        return sendRoomMutation(reply, async () =>
            closeStoredRoom(params.data.roomId),
        );
    });
}

/**
 * 获取可以开始对局的房间快照，并校验房主、房间状态和成员准备状态。
 */
async function getStartedRoomInput(
    roomId: string,
    ownerUserId: string,
): Promise<RoomDTO> {
    const room = await getStoredRoom(roomId);
    if (room === undefined) {
        throw new Error("房间不存在");
    }
    if (room.ownerUserId !== ownerUserId) {
        throw new Error("只有房主可以开始对局");
    }
    if (room.status !== ROOM_STATUS_OPEN) {
        throw new Error("房间当前状态不能开始对局");
    }
    const activePlayers = getActiveRoomPlayers(room);
    if (activePlayers.length < 2 && !room.botFillEnabled) {
        throw new Error("房间人数不足，无法开始对局");
    }
    const unreadyPlayers = activePlayers.filter(
        (player) => player.userId !== ownerUserId && !player.ready,
    );
    if (unreadyPlayers.length > 0) {
        throw new Error("仍有房间成员未准备");
    }
    return room;
}

/**
 * 从房间成员生成核心层需要的玩家身份，未满员且允许补位时自动补机器人。
 */
function createRoomPlayerIdentities(room: RoomDTO): PlayerIdentityDTO[] {
    const activePlayers = getActiveRoomPlayers(room);
    const occupiedSeats = new Set(activePlayers.map((player) => player.seat));
    const identities = activePlayers.map(toPlayerIdentity);
    if (room.botFillEnabled) {
        for (let seat = 0; seat < room.playerCount; seat += 1) {
            if (!occupiedSeats.has(seat)) {
                identities.push(createBotIdentity(room.id, seat));
            }
        }
    }
    if (identities.length < 2) {
        throw new Error("房间人数不足，无法开始对局");
    }
    return identities.sort((current, next) => current.seat - next.seat);
}

/**
 * 获取仍在房间内的成员。
 */
function getActiveRoomPlayers(room: RoomDTO): RoomPlayerDTO[] {
    return room.players.filter((player) => player.leftAt === undefined);
}

/**
 * 把房间成员转换为核心层玩家身份。
 */
function toPlayerIdentity(player: RoomPlayerDTO): PlayerIdentityDTO {
    return {
        playerId: player.userId,
        accountId: `room-account-${player.userId}`,
        seat: player.seat,
        name: player.nickname ?? "玩家",
        playerType:
            player.playerType === PlayerType.BOT
                ? PlayerType.BOT
                : PlayerType.HUMAN,
        ...(player.playerType === PlayerType.BOT
            ? { botProfileId: `room-bot-${player.seat + 1}` }
            : {}),
    };
}

/**
 * 创建房间补位机器人身份，机器人用户会在创建对局落库时补齐。
 */
function createBotIdentity(roomId: string, seat: number): PlayerIdentityDTO {
    const playerId = `room-${roomId}-bot-${seat + 1}`;
    return {
        playerId,
        accountId: `bot-account-${playerId}`,
        seat,
        name: `机器人${seat + 1}`,
        playerType: PlayerType.BOT,
        botProfileId: `room-bot-${seat + 1}`,
    };
}

/**
 * 标准化用户输入的房间号，避免大小写和首尾空格影响加入。
 */
function normalizeRoomCode(roomCode: string): string {
    return roomCode.trim().toUpperCase();
}

/**
 * 统一处理房间写操作异常，当前先返回中文业务错误。
 */
async function sendRoomMutation(
    reply: {
        status: (statusCode: number) => {
            send: (payload: ApiResponse<RoomDTO>) => unknown;
        };
    },
    mutate: () => Promise<RoomDTO>,
) {
    try {
        const room = await mutate();
        return createSuccessResponse(room);
    } catch (error) {
        return reply
            .status(400)
            .send(
                createErrorResponse(
                    error instanceof Error ? error.message : "房间操作失败",
                ),
            );
    }
}

/**
 * 创建房间接口成功响应。
 */
function createSuccessResponse(data: RoomDTO): ApiResponse<RoomDTO> {
    return {
        success: true,
        data,
        errorCode: GameErrorCode.NONE,
        errorMessage: "",
    };
}

/**
 * 创建房间接口错误响应。
 */
function createErrorResponse(errorMessage: string): ApiResponse<RoomDTO> {
    return {
        success: false,
        errorCode: GameErrorCode.VALIDATION_ERROR,
        errorMessage,
    };
}

/**
 * 创建泛型数据成功响应。
 */
function createDataResponse<T>(data: T): ApiResponse<T> {
    return {
        success: true,
        data,
        errorCode: GameErrorCode.NONE,
        errorMessage: "",
    };
}
