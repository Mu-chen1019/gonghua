/**
 * 用户接口路由模块。
 *
 * 本文件负责用户个人配置的参数校验和响应包装，不直接访问 Prisma，也不处理对局规则。
 * 后续个人页接入时可以复用这些接口读取和保存玩家偏好。
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { GameErrorCode } from "@gonghua/contracts";
import type {
    ApiResponse,
    PlayerStatDTO,
    UpdateUserSettingDTO,
    UserSettingDTO,
} from "@gonghua/contracts";
import { getStoredPlayerStat } from "../stat-store";
import { getStoredUserSetting, updateStoredUserSetting } from "../user-store";
import { logServerAction } from "../logger";
import { ensureSameUser, requireAuthenticatedUser } from "./authGuard";

/** 用户路径参数校验规则。 */
const userParamsSchema = z.object({
    userId: z.string().min(1),
});

/** 用户配置更新请求体校验规则，所有字段都允许局部更新。 */
const updateUserSettingSchema = z.object({
    autoSortEnabled: z.boolean().optional(),
    botLevel: z.string().min(1).optional(),
    soundEnabled: z.boolean().optional(),
    animationEnabled: z.boolean().optional(),
    showEventPanel: z.boolean().optional(),
});

/**
 * 注册用户相关接口。
 */
export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
    app.get("/users/me/settings", async (request, reply) => {
        /** me 接口直接使用登录用户，前端不需要拼接用户标识。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        return sendUserSetting(authUser.id);
    });

    app.put("/users/me/settings", async (request, reply) => {
        /** me 配置更新只取 token 用户，避免路径参数和登录态不一致。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        /** 请求体校验结果。 */
        const body = updateUserSettingSchema.safeParse(request.body ?? {});
        if (!body.success) {
            return reply
                .status(400)
                .send(
                    createErrorResponse(
                        GameErrorCode.VALIDATION_ERROR,
                        "更新用户配置参数不合法",
                    ),
                );
        }
        return sendUpdatedUserSetting(authUser.id, body.data);
    });

    app.get("/users/me/stats", async (request, reply) => {
        /** me 战绩接口直接使用登录用户，前端不需要暴露用户标识。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        return sendPlayerStat(authUser.id);
    });

    app.get("/users/:userId/settings", async (request, reply) => {
        /** 用户配置只允许本人读取。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        /** 路径参数校验结果。 */
        const params = userParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply
                .status(400)
                .send(
                    createErrorResponse(
                        GameErrorCode.VALIDATION_ERROR,
                        "查询用户配置参数不合法",
                    ),
                );
        }
        if (!ensureSameUser(reply, authUser, params.data.userId)) {
            return;
        }
        return sendUserSetting(params.data.userId);
    });

    app.put("/users/:userId/settings", async (request, reply) => {
        /** 用户配置只允许本人修改。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        /** 路径参数校验结果。 */
        const params = userParamsSchema.safeParse(request.params);
        /** 请求体校验结果。 */
        const body = updateUserSettingSchema.safeParse(request.body ?? {});
        if (!params.success || !body.success) {
            return reply
                .status(400)
                .send(
                    createErrorResponse(
                        GameErrorCode.VALIDATION_ERROR,
                        "更新用户配置参数不合法",
                    ),
                );
        }
        if (!ensureSameUser(reply, authUser, params.data.userId)) {
            return;
        }
        return sendUpdatedUserSetting(params.data.userId, body.data);
    });

    app.get("/users/:userId/stats", async (request, reply) => {
        /** 个人战绩当前只开放本人查询，排行榜仍走 records/player-stats。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        /** 路径参数校验结果。 */
        const params = userParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply
                .status(400)
                .send(
                    createErrorResponse(
                        GameErrorCode.VALIDATION_ERROR,
                        "查询用户战绩参数不合法",
                    ),
                );
        }
        if (!ensureSameUser(reply, authUser, params.data.userId)) {
            return;
        }
        return sendPlayerStat(params.data.userId);
    });
}

/**
 * 读取用户配置并返回统一响应，供 me 路由和兼容路由复用。
 */
async function sendUserSetting(
    userId: string,
): Promise<ApiResponse<UserSettingDTO>> {
    const setting = await getStoredUserSetting(userId);
    logServerAction("api", "get_user_setting", {
        route: "GET /users/settings",
        playerId: userId,
        success: true,
    });
    return createSuccessResponse(setting);
}

/**
 * 更新用户配置并返回统一响应，供 me 路由和兼容路由复用。
 */
async function sendUpdatedUserSetting(
    userId: string,
    input: {
        autoSortEnabled?: boolean | undefined;
        botLevel?: string | undefined;
        soundEnabled?: boolean | undefined;
        animationEnabled?: boolean | undefined;
        showEventPanel?: boolean | undefined;
    },
): Promise<ApiResponse<UserSettingDTO>> {
    const setting = await updateStoredUserSetting(
        userId,
        toUpdateUserSettingDTO(input),
    );
    logServerAction("api", "update_user_setting", {
        route: "PUT /users/settings",
        playerId: userId,
        success: true,
    });
    return createSuccessResponse(setting);
}

/**
 * 读取用户战绩并返回统一响应，供 me 路由和兼容路由复用。
 */
async function sendPlayerStat(
    userId: string,
): Promise<ApiResponse<PlayerStatDTO>> {
    const stat = await getStoredPlayerStat(userId);
    logServerAction("api", "get_user_stat", {
        route: "GET /users/stats",
        playerId: userId,
        success: true,
    });
    return createDataResponse<PlayerStatDTO>(stat);
}

/**
 * 创建标准成功响应，保持用户接口和对局接口响应结构一致。
 */
function createSuccessResponse(
    data: UserSettingDTO,
): ApiResponse<UserSettingDTO> {
    return {
        success: true,
        data,
        errorCode: GameErrorCode.NONE,
        errorMessage: "",
    };
}

/**
 * 创建用户配置接口错误响应。
 */
function createErrorResponse(
    errorCode: GameErrorCode,
    errorMessage: string,
): ApiResponse<UpdateUserSettingDTO> {
    return {
        success: false,
        errorCode,
        errorMessage,
    };
}

/**
 * 创建用户只读数据接口成功响应。
 */
function createDataResponse<T>(data: T): ApiResponse<T> {
    return {
        success: true,
        data,
        errorCode: GameErrorCode.NONE,
        errorMessage: "",
    };
}

/**
 * 过滤 Zod 可选字段中的 undefined，满足 exactOptionalPropertyTypes 下的 DTO 约束。
 */
function toUpdateUserSettingDTO(input: {
    autoSortEnabled?: boolean | undefined;
    botLevel?: string | undefined;
    soundEnabled?: boolean | undefined;
    animationEnabled?: boolean | undefined;
    showEventPanel?: boolean | undefined;
}): UpdateUserSettingDTO {
    return {
        ...(input.autoSortEnabled === undefined
            ? {}
            : { autoSortEnabled: input.autoSortEnabled }),
        ...(input.botLevel === undefined ? {} : { botLevel: input.botLevel }),
        ...(input.soundEnabled === undefined
            ? {}
            : { soundEnabled: input.soundEnabled }),
        ...(input.animationEnabled === undefined
            ? {}
            : { animationEnabled: input.animationEnabled }),
        ...(input.showEventPanel === undefined
            ? {}
            : { showEventPanel: input.showEventPanel }),
    };
}
