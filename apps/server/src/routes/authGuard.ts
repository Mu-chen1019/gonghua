/**
 * 路由鉴权工具模块。
 *
 * 本文件统一解析 Bearer token，并提供身份一致性校验响应。
 * 业务路由只关心当前登录用户，不直接处理 token 查询和认证错误包装。
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { GameErrorCode } from "@gonghua/contracts";
import type { ApiResponse, UserDTO } from "@gonghua/contracts";
import { getUserByToken } from "../auth-store";

/**
 * 读取当前登录用户；未登录或会话失效时直接写入 401 响应。
 */
export async function requireAuthenticatedUser(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<UserDTO | undefined> {
    const token = readBearerToken(request.headers.authorization);
    if (token === undefined) {
        reply.status(401).send(createAuthError("未登录"));
        return undefined;
    }
    const user = await getUserByToken(token);
    if (user === undefined) {
        reply.status(401).send(createAuthError("登录已失效"));
        return undefined;
    }
    return user;
}

/**
 * 校验请求中的用户标识是否属于当前登录用户，不允许前端冒用他人身份。
 */
export function ensureSameUser(
    reply: FastifyReply,
    authUser: UserDTO,
    targetUserId: string,
): boolean {
    if (authUser.id === targetUserId) {
        return true;
    }
    reply.status(403).send(createAuthError("无权操作其他用户数据"));
    return false;
}

/**
 * 从 Authorization 请求头读取 Bearer token。
 */
function readBearerToken(
    authorization: string | undefined,
): string | undefined {
    if (authorization === undefined || !authorization.startsWith("Bearer ")) {
        return undefined;
    }
    return authorization.slice("Bearer ".length).trim();
}

/**
 * 创建鉴权错误响应，复用现有错误码体系，避免为本次收口新增协议枚举。
 */
function createAuthError(errorMessage: string): ApiResponse<unknown> {
    return {
        success: false,
        errorCode: GameErrorCode.INVALID_ACTOR,
        errorMessage,
    };
}
