/**
 * 资源权限校验工具模块。
 *
 * 本文件区分“已经登录”和“是否属于具体资源”两层权限。
 * 登录态由 `authGuard` 处理，本文件只负责房间成员、房主和对局参与者判断。
 */
import type { FastifyReply } from "fastify";
import { GameErrorCode } from "@gonghua/contracts";
import type { ApiResponse, RoomDTO, UserDTO } from "@gonghua/contracts";
import { getStoredGameParticipant } from "../gameStore";

/**
 * 确保当前用户是指定房间的房主或仍在房间内的成员。
 */
export function ensureRoomParticipant(
    reply: FastifyReply,
    room: RoomDTO,
    authUser: UserDTO,
): boolean {
    if (isRoomParticipant(room, authUser.id)) {
        return true;
    }
    reply.status(403).send(createResourceError("无权访问该房间"));
    return false;
}

/**
 * 确保当前用户是指定对局的参与者，对局不存在时返回 404。
 */
export async function ensureGameParticipant(
    reply: FastifyReply,
    gameId: string,
    authUser: UserDTO,
): Promise<boolean> {
    const participant = await getStoredGameParticipant(gameId, authUser.id);
    if (!participant.gameExists) {
        reply.status(404).send(createResourceError("对局不存在"));
        return false;
    }
    if (!participant.isParticipant) {
        reply.status(403).send(createResourceError("无权访问该对局"));
        return false;
    }
    return true;
}

/**
 * 判断用户是否仍属于房间可见成员，离开后的成员不能继续读取房间详情。
 */
function isRoomParticipant(room: RoomDTO, userId: string): boolean {
    if (room.ownerUserId === userId) {
        return true;
    }
    return room.players.some(
        (player) => player.userId === userId && player.leftAt === undefined,
    );
}

/**
 * 创建资源权限错误响应，复用现有错误码体系。
 */
function createResourceError(errorMessage: string): ApiResponse<unknown> {
    return {
        success: false,
        errorCode: GameErrorCode.INVALID_ACTOR,
        errorMessage,
    };
}
