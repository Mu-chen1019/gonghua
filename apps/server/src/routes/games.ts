/**
 * 对局接口路由模块，负责参数校验、调用仓库层并返回标准响应。
 */
import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
    GameActionType,
    GameErrorCode,
    GameFinishReason,
    GameMode,
} from "@gonghua/contracts";
import type {
    ApiResponse,
    FinishGameDTO,
    GameActionDTO,
    GameActionRecordListDTO,
    GameMutationResponseDTO,
    GameResultDTO,
    SubmitGameActionDTO,
} from "@gonghua/contracts";
import { ensureSameUser, requireAuthenticatedUser } from "./authGuard";
import {
    createStoredGame,
    finishStoredGame,
    getStoredGameResult,
    getStoredGameView,
    listStoredGameActionLogs,
    submitStoredBotStep,
    submitStoredGameAction,
} from "../gameStore";
import { logServerAction } from "../logger";
import { ensureGameParticipant } from "./resourceGuard";

/** 创建对局请求校验规则，限制玩家数量和可选随机种子。 */
const createGameSchema = z.object({
    playerCount: z.number().int().min(2).max(6).default(4),
    currentPlayerId: z.string().min(1).optional(),
    mode: z.nativeEnum(GameMode).default(GameMode.NORMAL),
    seed: z.number().int().positive().optional(),
});

/** 对局路径参数校验规则。 */
const paramsSchema = z.object({
    gameId: z.string().min(1),
});

/** 查询对局视角时使用的查询参数校验规则。 */
const querySchema = z.object({
    playerId: z.string().min(1).optional(),
});

/** 日志查询参数校验规则。 */
const actionLogQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(100),
});

/** 玩家动作请求体校验规则，按动作类型区分必填参数。 */
const actionSchema = z.discriminatedUnion("actionType", [
    z.object({ actionType: z.literal(GameActionType.EXCHANGE_TRUMP_CARD) }),
    z.object({
        actionType: z.literal(GameActionType.PLAY_ATTACK_CARD),
        cardId: z.string().min(1),
    }),
    z.object({
        actionType: z.literal(GameActionType.PLAY_ATTACK_CARDS),
        cardIds: z.array(z.string().min(1)).min(2),
    }),
    z.object({
        actionType: z.literal(GameActionType.PLAY_DEFENSE_CARD),
        cardId: z.string().min(1),
        targetPairId: z.string().min(1),
    }),
    z.object({
        actionType: z.literal(GameActionType.RECALL_DEFENSE_CARD),
        sourcePairId: z.string().min(1),
    }),
    z.object({
        actionType: z.literal(GameActionType.MOVE_DEFENSE_CARD),
        sourcePairId: z.string().min(1),
        targetPairId: z.string().min(1),
    }),
    z.object({ actionType: z.literal(GameActionType.STOP_ATTACK) }),
    z.object({ actionType: z.literal(GameActionType.GIVE_UP_DEFENSE) }),
    z.object({ actionType: z.literal(GameActionType.COLLECT_TABLE_CARDS) }),
]);

/** 提交动作接口的完整请求体校验规则。 */
const submitActionSchema = z.object({
    playerId: z.string().min(1),
    action: actionSchema,
    clientActionId: z.string().min(1).max(100).optional(),
    stateVersion: z.number().int().min(0).optional(),
});

/** 机器人单步推进接口的请求体校验规则。 */
const botStepSchema = z.object({
    playerId: z.string().min(1),
});

/** 主动结束人机对局接口的请求体校验规则。 */
const finishGameSchema = z.object({
    playerId: z.string().min(1),
    finishReason: z.enum([
        GameFinishReason.PLAYER_EXIT,
        GameFinishReason.RESTART,
    ]),
});

/**
 * 注册对局相关接口，包括创建、查询和提交动作。
 */
export async function registerGameRoutes(app: FastifyInstance): Promise<void> {
    app.post("/games", async (request, reply) => {
        /** 创建对局必须使用当前登录账号，避免前端伪造 currentPlayerId。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        /** 创建对局请求体解析结果。 */
        const parsed = createGameSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply
                .status(400)
                .send(
                    createErrorResponse(
                        GameErrorCode.VALIDATION_ERROR,
                        "创建对局参数不合法",
                    ),
                );
        }
        const currentPlayerId = parsed.data.currentPlayerId ?? authUser.id;
        if (!ensureSameUser(reply, authUser, currentPlayerId)) {
            return;
        }
        /** 传递给仓库层的创建参数，当前玩家身份完全以登录态为准。 */
        const createInput = {
            playerCount: parsed.data.playerCount,
            currentPlayerId,
            currentPlayerName: authUser.nickname,
            mode: parsed.data.mode,
        };
        /** 仓库层负责创建权威状态并返回玩家视角。 */
        const result = await createStoredGame(
            parsed.data.seed === undefined
                ? createInput
                : { ...createInput, seed: parsed.data.seed },
        );
        logServerAction("api", "create_game", {
            route: "POST /games",
            errorCode: result.errorCode,
            success: result.success,
        });
        return reply
            .status(result.success ? 201 : 400)
            .send(toApiResponse(result));
    });

    app.get("/games/:gameId", async (request, reply) => {
        /** 查询对局视角必须与登录账号一致，避免读取他人视角。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        /** 路径参数校验结果。 */
        const params = paramsSchema.safeParse(request.params);
        /** 查询参数校验结果。 */
        const query = querySchema.safeParse(request.query ?? {});
        if (!params.success || !query.success) {
            return reply
                .status(400)
                .send(
                    createErrorResponse(
                        GameErrorCode.VALIDATION_ERROR,
                        "查询对局参数不合法",
                    ),
                );
        }
        const playerId = query.data.playerId ?? authUser.id;
        if (!ensureSameUser(reply, authUser, playerId)) {
            return;
        }
        if (
            !(await ensureGameParticipant(reply, params.data.gameId, authUser))
        ) {
            return;
        }
        /** 仓库层会按玩家标识过滤不可见手牌。 */
        const result = await getStoredGameView(params.data.gameId, playerId);
        logServerAction("api", "get_game", {
            route: "GET /games/:gameId",
            gameId: params.data.gameId,
            playerId,
            errorCode: result.errorCode,
            success: result.success,
        });
        return reply
            .status(result.success ? 200 : 404)
            .send(toApiResponse(result));
    });

    app.post("/games/:gameId/actions", async (request, reply) => {
        /** 玩家动作必须由登录账号本人提交，具体动作合法性继续交给 game-core。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        /** 动作接口路径参数校验结果。 */
        const params = paramsSchema.safeParse(request.params);
        /** 动作接口请求体校验结果。 */
        const body = submitActionSchema.safeParse(request.body);
        if (!params.success || !body.success) {
            return reply
                .status(400)
                .send(
                    createErrorResponse(
                        GameErrorCode.VALIDATION_ERROR,
                        "提交动作参数不合法",
                    ),
                );
        }
        if (!ensureSameUser(reply, authUser, body.data.playerId)) {
            return;
        }
        if (
            !(await ensureGameParticipant(reply, params.data.gameId, authUser))
        ) {
            return;
        }
        const submitInput: SubmitGameActionDTO = {
            playerId: body.data.playerId,
            action: body.data.action as GameActionDTO,
            ...(body.data.clientActionId === undefined
                ? {}
                : { clientActionId: body.data.clientActionId }),
            ...(body.data.stateVersion === undefined
                ? {}
                : { stateVersion: body.data.stateVersion }),
        };
        /** 仓库层负责调用核心状态机并保存成功后的新状态。 */
        const result = await submitStoredGameAction(
            params.data.gameId,
            submitInput.playerId,
            submitInput.action,
            {
                ...(submitInput.clientActionId === undefined
                    ? {}
                    : { clientActionId: submitInput.clientActionId }),
                ...(submitInput.stateVersion === undefined
                    ? {}
                    : { stateVersion: submitInput.stateVersion }),
            },
        );
        logServerAction("api", "submit_action", {
            route: "POST /games/:gameId/actions",
            gameId: params.data.gameId,
            playerId: submitInput.playerId,
            ...(submitInput.clientActionId === undefined
                ? {}
                : { clientActionId: submitInput.clientActionId }),
            ...(submitInput.stateVersion === undefined
                ? {}
                : { stateVersion: submitInput.stateVersion }),
            roundAction: submitInput.action.actionType,
            errorCode: result.errorCode,
            success: result.success,
        });
        return reply
            .status(resolveMutationStatusCode(result))
            .send(toApiResponse(result));
    });

    app.get("/games/:gameId/actions", async (request, reply) => {
        /** 动作日志查询需要登录态，后续联机阶段再补参与者级别校验。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        /** 路径参数校验结果。 */
        const params = paramsSchema.safeParse(request.params);
        /** 查询参数校验结果。 */
        const query = actionLogQuerySchema.safeParse(request.query ?? {});
        if (!params.success || !query.success) {
            return reply
                .status(400)
                .send(
                    createErrorResponse(
                        GameErrorCode.VALIDATION_ERROR,
                        "查询动作日志参数不合法",
                    ),
                );
        }
        if (
            !(await ensureGameParticipant(reply, params.data.gameId, authUser))
        ) {
            return;
        }
        const records = await listStoredGameActionLogs(
            params.data.gameId,
            query.data.limit,
        );
        logServerAction("api", "list_game_action_logs", {
            route: "GET /games/:gameId/actions",
            gameId: params.data.gameId,
            actions: records.length,
            success: true,
        });
        return createDataResponse<GameActionRecordListDTO>({ records });
    });

    app.get("/games/:gameId/result", async (request, reply) => {
        /** 对局结果查询需要登录态，避免匿名枚举对局结果。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        /** 路径参数校验结果。 */
        const params = paramsSchema.safeParse(request.params);
        if (!params.success) {
            return reply
                .status(400)
                .send(
                    createErrorResponse(
                        GameErrorCode.VALIDATION_ERROR,
                        "查询对局结果参数不合法",
                    ),
                );
        }
        if (
            !(await ensureGameParticipant(reply, params.data.gameId, authUser))
        ) {
            return;
        }
        const result = await getStoredGameResult(params.data.gameId);
        if (result === undefined) {
            return reply
                .status(404)
                .send(
                    createErrorResponse(
                        GameErrorCode.GAME_NOT_FOUND,
                        "对局结果不存在",
                    ),
                );
        }
        logServerAction("api", "get_game_result", {
            route: "GET /games/:gameId/result",
            gameId: params.data.gameId,
            success: true,
        });
        return createDataResponse<GameResultDTO>(result);
    });

    app.post("/games/:gameId/finish", async (request, reply) => {
        /** 主动结束人机局必须由当前登录玩家本人发起。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        /** 主动结束接口路径参数校验结果。 */
        const params = paramsSchema.safeParse(request.params);
        /** 主动结束接口请求体校验结果。 */
        const body = finishGameSchema.safeParse(request.body);
        if (!params.success || !body.success) {
            return reply
                .status(400)
                .send(
                    createErrorResponse(
                        GameErrorCode.VALIDATION_ERROR,
                        "结束对局参数不合法",
                    ),
                );
        }
        if (!ensureSameUser(reply, authUser, body.data.playerId)) {
            return;
        }
        if (
            !(await ensureGameParticipant(reply, params.data.gameId, authUser))
        ) {
            return;
        }
        const finishInput: FinishGameDTO = {
            playerId: body.data.playerId,
            finishReason: body.data.finishReason,
        };
        const result = await finishStoredGame(
            params.data.gameId,
            finishInput.playerId,
            finishInput.finishReason,
        );
        logServerAction("api", "finish_game", {
            route: "POST /games/:gameId/finish",
            gameId: params.data.gameId,
            playerId: finishInput.playerId,
            finishReason: finishInput.finishReason,
            errorCode: result.errorCode,
            success: result.success,
        });
        return reply
            .status(resolveMutationStatusCode(result))
            .send(toApiResponse(result));
    });

    app.post("/games/:gameId/bot-step", async (request, reply) => {
        /** 机器人推进以当前真人视角触发，不能替其他用户推进对局。 */
        const authUser = await requireAuthenticatedUser(request, reply);
        if (authUser === undefined) {
            return;
        }
        /** 机器人推进接口路径参数校验结果。 */
        const params = paramsSchema.safeParse(request.params);
        /** 机器人推进接口请求体校验结果。 */
        const body = botStepSchema.safeParse(request.body);
        if (!params.success || !body.success) {
            return reply
                .status(400)
                .send(
                    createErrorResponse(
                        GameErrorCode.VALIDATION_ERROR,
                        "机器人推进参数不合法",
                    ),
                );
        }
        if (!ensureSameUser(reply, authUser, body.data.playerId)) {
            return;
        }
        if (
            !(await ensureGameParticipant(reply, params.data.gameId, authUser))
        ) {
            return;
        }
        /** 仓库层负责推进一个机器人动作并保存成功后的新状态。 */
        const result = await submitStoredBotStep(
            params.data.gameId,
            body.data.playerId,
        );
        logServerAction("api", "submit_bot_step", {
            route: "POST /games/:gameId/bot-step",
            gameId: params.data.gameId,
            playerId: body.data.playerId,
            errorCode: result.errorCode,
            success: result.success,
        });
        return reply
            .status(result.success ? 200 : 400)
            .send(toApiResponse(result));
    });
}

/**
 * 将仓库层结果转换为标准接口响应。
 */
function toApiResponse(result: {
    success: boolean;
    data?: GameMutationResponseDTO;
    errorCode: GameErrorCode;
    errorMessage: string;
}): ApiResponse<GameMutationResponseDTO> {
    if (result.success && result.data !== undefined) {
        return {
            success: true,
            data: result.data,
            errorCode: GameErrorCode.NONE,
            errorMessage: "",
        };
    }
    return createErrorResponse(result.errorCode, result.errorMessage);
}

/**
 * 根据业务错误返回更准确的 HTTP 状态码，便于前端区分版本冲突和普通动作失败。
 */
function resolveMutationStatusCode(result: {
    success: boolean;
    errorCode: GameErrorCode;
}): number {
    if (result.success) {
        return 200;
    }
    return result.errorCode === GameErrorCode.STATE_VERSION_CONFLICT
        ? 409
        : 400;
}

/**
 * 创建标准错误响应，保证所有失败接口结构一致。
 */
function createErrorResponse(
    errorCode: GameErrorCode,
    errorMessage: string,
): ApiResponse<GameMutationResponseDTO> {
    return {
        success: false,
        errorCode,
        errorMessage,
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
