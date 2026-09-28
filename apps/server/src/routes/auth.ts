/**
 * 认证接口路由模块。
 *
 * 本文件负责注册、登录、查询当前用户和登出接口，路由层只做参数校验和响应包装。
 * 密码摘要、会话生成和数据库访问全部由 `auth-store` 处理。
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { GameErrorCode } from "@gonghua/contracts";
import type { ApiResponse, AuthSessionDTO, UserDTO } from "@gonghua/contracts";
import {
    getUserByToken,
    loginUser,
    logoutUser,
    registerUser,
} from "../auth-store";
import { logServerAction } from "../logger";

/** 账号密码请求基础校验规则。 */
const credentialSchema = z.object({
    username: z.string().trim().min(3).max(32),
    password: z.string().min(6).max(72),
    nickname: z.string().trim().min(1).max(32).optional(),
});

/** 登录请求校验规则。 */
const loginSchema = credentialSchema.pick({
    username: true,
    password: true,
});

/**
 * 注册认证接口。
 */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
    app.post("/auth/register", async (request, reply) => {
        const body = credentialSchema.safeParse(request.body);
        if (!body.success) {
            return reply
                .status(400)
                .send(createErrorResponse<AuthSessionDTO>("注册参数不合法"));
        }
        try {
            const session = await registerUser({
                username: body.data.username,
                password: body.data.password,
                ...(body.data.nickname === undefined
                    ? {}
                    : { nickname: body.data.nickname }),
            });
            logServerAction("api", "register_user", {
                route: "POST /auth/register",
                playerId: session.user.id,
                success: true,
            });
            return reply.status(201).send(createSuccessResponse(session));
        } catch (error) {
            return reply
                .status(400)
                .send(
                    createErrorResponse<AuthSessionDTO>(
                        error instanceof Error ? error.message : "注册失败",
                    ),
                );
        }
    });

    app.post("/auth/login", async (request, reply) => {
        const body = loginSchema.safeParse(request.body);
        if (!body.success) {
            return reply
                .status(400)
                .send(createErrorResponse<AuthSessionDTO>("登录参数不合法"));
        }
        try {
            const session = await loginUser(body.data);
            logServerAction("api", "login_user", {
                route: "POST /auth/login",
                playerId: session.user.id,
                success: true,
            });
            return createSuccessResponse(session);
        } catch (error) {
            return reply
                .status(401)
                .send(
                    createErrorResponse<AuthSessionDTO>(
                        error instanceof Error ? error.message : "登录失败",
                    ),
                );
        }
    });

    app.get("/auth/me", async (request, reply) => {
        const token = readBearerToken(request.headers.authorization);
        if (token === undefined) {
            return reply
                .status(401)
                .send(createErrorResponse<UserDTO>("未登录"));
        }
        const user = await getUserByToken(token);
        if (user === undefined) {
            return reply
                .status(401)
                .send(createErrorResponse<UserDTO>("登录已失效"));
        }
        return createSuccessResponse(user);
    });

    app.post("/auth/logout", async (request) => {
        const token = readBearerToken(request.headers.authorization);
        if (token !== undefined) {
            await logoutUser(token);
        }
        return createSuccessResponse({ success: true });
    });
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
 * 创建标准成功响应。
 */
function createSuccessResponse<T>(data: T): ApiResponse<T> {
    return {
        success: true,
        data,
        errorCode: GameErrorCode.NONE,
        errorMessage: "",
    };
}

/**
 * 创建认证接口错误响应。
 */
function createErrorResponse<T>(errorMessage: string): ApiResponse<T> {
    return {
        success: false,
        errorCode: GameErrorCode.VALIDATION_ERROR,
        errorMessage,
    };
}
