/**
 * 对局记录路由模块。
 *
 * 本文件只提供数据库主记录的只读查询，不读取完整内存对局状态，也不承担游戏规则判断。
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { GameErrorCode } from "@gonghua/contracts";
import type {
    ApiResponse,
    GameRecordListDTO,
    PlayerStatListDTO,
} from "@gonghua/contracts";
import { listStoredGameRecords } from "../gameStore";
import { logServerAction } from "../logger";
import { listStoredPlayerStats } from "../stat-store";
import { ensureSameUser, requireAuthenticatedUser } from "./authGuard";

/** 默认返回最近对局数量，避免初版接口一次性返回过多记录。 */
const DEFAULT_RECORD_LIMIT = 50;

/** 对局记录查询参数校验规则。 */
const gameRecordQuerySchema = z.object({
    userId: z.string().min(1).optional(),
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(DEFAULT_RECORD_LIMIT),
});

/**
 * 注册对局记录相关接口。
 */
export async function registerRecordRoutes(
    app: FastifyInstance,
): Promise<void> {
    app.get("/records/games", async (request, reply) => {
        /** 最近对局列表按登录账号过滤，前端传 userId 时也必须与 token 一致。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        const query = gameRecordQuerySchema.safeParse(request.query ?? {});
        if (!query.success) {
            return reply
                .status(400)
                .send(createErrorResponse<GameRecordListDTO>("查询参数不合法"));
        }
        if (
            query.data.userId !== undefined &&
            !ensureSameUser(reply, authUser, query.data.userId)
        ) {
            return;
        }
        const userId = query.data.userId ?? authUser.id;
        const records = await listStoredGameRecords({
            limit: query.data.limit,
            userId,
        });
        logServerAction("api", "list_game_records", {
            route: "GET /records/games",
            playerId: userId,
            actions: records.length,
            success: true,
        });
        return createSuccessResponse({ records });
    });

    app.get("/records/player-stats", async () => {
        const records = await listStoredPlayerStats(DEFAULT_RECORD_LIMIT);
        logServerAction("api", "list_player_stats", {
            route: "GET /records/player-stats",
            actions: records.length,
            success: true,
        });
        return createDataResponse<PlayerStatListDTO>({ records });
    });
}

/**
 * 创建标准成功响应，保持与对局接口同样的外层结构。
 */
function createSuccessResponse(
    data: GameRecordListDTO,
): ApiResponse<GameRecordListDTO> {
    return {
        success: true,
        data,
        errorCode: GameErrorCode.NONE,
        errorMessage: "",
    };
}

/**
 * 创建只读数据接口成功响应。
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
 * 创建只读数据接口错误响应。
 */
function createErrorResponse<T>(errorMessage: string): ApiResponse<T> {
    return {
        success: false,
        errorCode: GameErrorCode.VALIDATION_ERROR,
        errorMessage,
    };
}
