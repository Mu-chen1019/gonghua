/**
 * 路由注册入口测试。
 *
 * 本文件验证统一路由入口、登录态保护和核心业务接口仍能串起来。
 * 鉴权后，除健康检查、登录注册和公开排行榜外，用户维度接口都必须携带有效 token。
 */
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { GameFinishReason, GameMode } from "@gonghua/contracts";
import { registerRoutes } from "./index";

describe("registerRoutes", () => {
    it("registers routes and protects user scoped APIs", async () => {
        const app = Fastify({ logger: false });

        await registerRoutes(app);

        const healthResponse = await app.inject({
            method: "GET",
            url: "/health",
        });
        expect(healthResponse.statusCode).toBe(200);
        expect(healthResponse.json()).toEqual({ status: "ok" });

        const unauthenticatedCreateResponse = await app.inject({
            method: "POST",
            url: "/games",
            payload: {},
        });
        expect(unauthenticatedCreateResponse.statusCode).toBe(401);

        const primarySession = await registerTestUser(app, {
            username: "test-user",
            nickname: "测试用户",
        });
        const secondarySession = await registerTestUser(app, {
            username: "second-user",
            nickname: "第二玩家",
        });
        const outsideSession = await registerTestUser(app, {
            username: "outside-user",
            nickname: "旁观用户",
        });
        const primaryHeaders = createAuthHeaders(primarySession.token);
        const secondaryHeaders = createAuthHeaders(secondarySession.token);
        const outsideHeaders = createAuthHeaders(outsideSession.token);

        const createResponse = await app.inject({
            method: "POST",
            url: "/games",
            headers: primaryHeaders,
            payload: {
                playerCount: 4,
                mode: GameMode.NORMAL,
            },
        });
        expect(createResponse.statusCode).toBe(201);
        const createBody = createResponse.json() as {
            success: boolean;
            data?: {
                viewState: {
                    gameId: string;
                    players: Array<{
                        isCurrentPlayer: boolean;
                        name: string;
                    }>;
                };
            };
        };
        expect(createBody.success).toBe(true);
        expect(
            createBody.data?.viewState.players.find(
                (player) => player.isCurrentPlayer,
            )?.name,
        ).toBe("测试用户");

        const gameId = createBody.data?.viewState.gameId;
        expect(gameId).toBeTypeOf("string");

        const forgedCreateResponse = await app.inject({
            method: "POST",
            url: "/games",
            headers: primaryHeaders,
            payload: {
                currentPlayerId: secondarySession.user.id,
                playerCount: 4,
            },
        });
        expect(forgedCreateResponse.statusCode).toBe(403);

        const viewResponse = await app.inject({
            method: "GET",
            url: `/games/${gameId}`,
            headers: primaryHeaders,
        });
        expect(viewResponse.statusCode).toBe(200);

        const forgedViewResponse = await app.inject({
            method: "GET",
            url: `/games/${gameId}?playerId=${secondarySession.user.id}`,
            headers: primaryHeaders,
        });
        expect(forgedViewResponse.statusCode).toBe(403);

        const outsideViewResponse = await app.inject({
            method: "GET",
            url: `/games/${gameId}`,
            headers: outsideHeaders,
        });
        expect(outsideViewResponse.statusCode).toBe(403);

        const actionResponse = await app.inject({
            method: "POST",
            url: `/games/${gameId}/actions`,
            headers: primaryHeaders,
            payload: {},
        });
        expect(actionResponse.statusCode).toBe(400);

        const botStepResponse = await app.inject({
            method: "POST",
            url: `/games/${gameId}/bot-step`,
            headers: primaryHeaders,
            payload: {},
        });
        expect(botStepResponse.statusCode).toBe(400);

        const finishNormalGameResponse = await app.inject({
            method: "POST",
            url: `/games/${gameId}/finish`,
            headers: primaryHeaders,
            payload: {
                playerId: primarySession.user.id,
                finishReason: GameFinishReason.PLAYER_EXIT,
            },
        });
        expect(finishNormalGameResponse.statusCode).toBe(400);

        const gameActionLogsResponse = await app.inject({
            method: "GET",
            url: `/games/${gameId}/actions`,
            headers: primaryHeaders,
        });
        expect(gameActionLogsResponse.statusCode).toBe(200);
        expect(gameActionLogsResponse.json()).toMatchObject({
            success: true,
            errorCode: "none",
            errorMessage: "",
        });

        const outsideGameActionLogsResponse = await app.inject({
            method: "GET",
            url: `/games/${gameId}/actions`,
            headers: outsideHeaders,
        });
        expect(outsideGameActionLogsResponse.statusCode).toBe(403);

        const gameResultResponse = await app.inject({
            method: "GET",
            url: `/games/${gameId}/result`,
            headers: primaryHeaders,
        });
        expect(gameResultResponse.statusCode).toBe(404);

        const outsideGameResultResponse = await app.inject({
            method: "GET",
            url: `/games/${gameId}/result`,
            headers: outsideHeaders,
        });
        expect(outsideGameResultResponse.statusCode).toBe(403);

        const unauthenticatedRecordsResponse = await app.inject({
            method: "GET",
            url: "/records/games",
        });
        expect(unauthenticatedRecordsResponse.statusCode).toBe(401);

        const recordsResponse = await app.inject({
            method: "GET",
            url: "/records/games",
            headers: primaryHeaders,
        });
        expect(recordsResponse.statusCode).toBe(200);
        expect(recordsResponse.json()).toMatchObject({
            success: true,
            errorCode: "none",
            errorMessage: "",
        });

        const forgedRecordsResponse = await app.inject({
            method: "GET",
            url: `/records/games?userId=${secondarySession.user.id}`,
            headers: primaryHeaders,
        });
        expect(forgedRecordsResponse.statusCode).toBe(403);

        const playerStatsResponse = await app.inject({
            method: "GET",
            url: "/records/player-stats",
        });
        expect(playerStatsResponse.statusCode).toBe(200);
        expect(playerStatsResponse.json()).toEqual({
            success: true,
            data: { records: [] },
            errorCode: "none",
            errorMessage: "",
        });

        const userSettingResponse = await app.inject({
            method: "GET",
            url: "/users/me/settings",
            headers: primaryHeaders,
        });
        expect(userSettingResponse.statusCode).toBe(200);
        expect(userSettingResponse.json()).toMatchObject({
            success: true,
            data: {
                userId: primarySession.user.id,
                autoSortEnabled: false,
            },
            errorCode: "none",
            errorMessage: "",
        });

        const forgedUserSettingResponse = await app.inject({
            method: "GET",
            url: `/users/${secondarySession.user.id}/settings`,
            headers: primaryHeaders,
        });
        expect(forgedUserSettingResponse.statusCode).toBe(403);

        const updateUserSettingResponse = await app.inject({
            method: "PUT",
            url: "/users/me/settings",
            headers: primaryHeaders,
            payload: {
                autoSortEnabled: true,
                botLevel: "NORMAL",
                soundEnabled: false,
            },
        });
        expect(updateUserSettingResponse.statusCode).toBe(200);
        expect(updateUserSettingResponse.json()).toMatchObject({
            success: true,
            data: {
                userId: primarySession.user.id,
                autoSortEnabled: true,
                botLevel: "NORMAL",
                soundEnabled: false,
            },
            errorCode: "none",
            errorMessage: "",
        });

        const userStatsResponse = await app.inject({
            method: "GET",
            url: "/users/me/stats",
            headers: primaryHeaders,
        });
        expect(userStatsResponse.statusCode).toBe(200);
        expect(userStatsResponse.json()).toMatchObject({
            success: true,
            data: {
                userId: primarySession.user.id,
                totalGames: 0,
            },
            errorCode: "none",
            errorMessage: "",
        });

        const createBotGameResponse = await app.inject({
            method: "POST",
            url: "/games",
            headers: primaryHeaders,
            payload: {
                playerCount: 4,
                mode: GameMode.HUMAN_VS_BOTS,
            },
        });
        expect(createBotGameResponse.statusCode).toBe(201);
        const createBotGameBody = createBotGameResponse.json() as {
            success: boolean;
            data?: {
                viewState: {
                    gameId: string;
                    mode: GameMode;
                    phase: string;
                };
            };
        };
        expect(createBotGameBody.data?.viewState.mode).toBe(
            GameMode.HUMAN_VS_BOTS,
        );
        const botGameId = createBotGameBody.data?.viewState.gameId;
        expect(botGameId).toBeTypeOf("string");

        const finishBotGameResponse = await app.inject({
            method: "POST",
            url: `/games/${botGameId}/finish`,
            headers: primaryHeaders,
            payload: {
                playerId: primarySession.user.id,
                finishReason: GameFinishReason.PLAYER_EXIT,
            },
        });
        expect(finishBotGameResponse.statusCode).toBe(200);
        expect(finishBotGameResponse.json()).toMatchObject({
            success: true,
            data: {
                viewState: {
                    mode: GameMode.HUMAN_VS_BOTS,
                    phase: "game_over",
                },
                hasPendingBotAction: false,
            },
            errorCode: "none",
            errorMessage: "",
        });

        const createRoomResponse = await app.inject({
            method: "POST",
            url: "/rooms",
            headers: primaryHeaders,
            payload: {
                playerCount: 4,
            },
        });
        expect(createRoomResponse.statusCode).toBe(201);
        const createRoomBody = createRoomResponse.json() as {
            success: boolean;
            data?: {
                id: string;
                roomCode: string;
                players: Array<{
                    userId: string;
                    nickname?: string;
                    ready: boolean;
                }>;
            };
        };
        expect(createRoomBody.success).toBe(true);
        expect(createRoomBody.data?.players[0]).toMatchObject({
            userId: primarySession.user.id,
            nickname: "测试用户",
            ready: false,
        });
        const roomId = createRoomBody.data?.id;
        expect(roomId).toBeTypeOf("string");
        const roomCode = createRoomBody.data?.roomCode;
        expect(roomCode).toBeTypeOf("string");

        const forgedJoinRoomResponse = await app.inject({
            method: "POST",
            url: `/rooms/${roomId}/join`,
            headers: primaryHeaders,
            payload: {
                userId: secondarySession.user.id,
            },
        });
        expect(forgedJoinRoomResponse.statusCode).toBe(403);

        const joinRoomResponse = await app.inject({
            method: "POST",
            url: "/rooms/join-by-code",
            headers: secondaryHeaders,
            payload: {
                roomCode: roomCode?.toLowerCase(),
            },
        });
        expect(joinRoomResponse.statusCode).toBe(200);
        expect(joinRoomResponse.json()).toMatchObject({
            success: true,
            data: {
                id: roomId,
                roomCode,
            },
            errorCode: "none",
            errorMessage: "",
        });

        const readyRoomResponse = await app.inject({
            method: "POST",
            url: `/rooms/${roomId}/ready`,
            headers: secondaryHeaders,
            payload: {
                ready: true,
            },
        });
        expect(readyRoomResponse.statusCode).toBe(200);

        const startRoomResponse = await app.inject({
            method: "POST",
            url: `/rooms/${roomId}/start`,
            headers: primaryHeaders,
            payload: {},
        });
        expect(startRoomResponse.statusCode).toBe(201);
        const startRoomBody = startRoomResponse.json() as {
            success: boolean;
            data?: {
                room: {
                    currentGameId?: string;
                    status: string;
                };
                game: {
                    viewState: {
                        gameId: string;
                        players: Array<{
                            playerId: string;
                            name: string;
                        }>;
                    };
                };
            };
        };
        expect(startRoomBody.success).toBe(true);
        expect(startRoomBody.data?.room.status).toBe("STARTED");
        expect(startRoomBody.data?.game.viewState.gameId).toBeTypeOf("string");
        expect(startRoomBody.data?.room.currentGameId).toBe(
            startRoomBody.data?.game.viewState.gameId,
        );
        expect(startRoomBody.data?.game.viewState.players).toHaveLength(4);
        expect(
            startRoomBody.data?.game.viewState.players.find(
                (player) => player.playerId === secondarySession.user.id,
            )?.name,
        ).toBe("第二玩家");

        const getRoomResponse = await app.inject({
            method: "GET",
            url: `/rooms/${roomId}`,
            headers: primaryHeaders,
        });
        expect(getRoomResponse.statusCode).toBe(200);
        expect(getRoomResponse.json()).toMatchObject({
            success: true,
            data: {
                currentGameId: startRoomBody.data?.game.viewState.gameId,
                status: "STARTED",
            },
            errorCode: "none",
            errorMessage: "",
        });

        const joinStartedRoomResponse = await app.inject({
            method: "POST",
            url: "/rooms/join-by-code",
            headers: outsideHeaders,
            payload: {
                roomCode,
            },
        });
        expect(joinStartedRoomResponse.statusCode).toBe(400);
        expect(joinStartedRoomResponse.json()).toMatchObject({
            success: false,
            errorMessage: "房间已开始",
        });

        const outsideRoomResponse = await app.inject({
            method: "GET",
            url: `/rooms/${roomId}`,
            headers: outsideHeaders,
        });
        expect(outsideRoomResponse.statusCode).toBe(403);

        const leaveRoomResponse = await app.inject({
            method: "POST",
            url: `/rooms/${roomId}/leave`,
            headers: secondaryHeaders,
            payload: {},
        });
        expect(leaveRoomResponse.statusCode).toBe(200);

        const closeRoomResponse = await app.inject({
            method: "POST",
            url: `/rooms/${roomId}/close`,
            headers: primaryHeaders,
        });
        expect(closeRoomResponse.statusCode).toBe(200);

        const emptyRoomResponse = await app.inject({
            method: "POST",
            url: "/rooms",
            headers: outsideHeaders,
            payload: {
                playerCount: 2,
            },
        });
        expect(emptyRoomResponse.statusCode).toBe(201);
        const emptyRoomBody = emptyRoomResponse.json() as {
            success: boolean;
            data?: {
                id: string;
                roomCode: string;
            };
        };
        const emptyRoomId = emptyRoomBody.data?.id;
        expect(emptyRoomId).toBeTypeOf("string");
        const emptyRoomCode = emptyRoomBody.data?.roomCode;
        expect(emptyRoomCode).toBeTypeOf("string");

        const leaveEmptyRoomResponse = await app.inject({
            method: "POST",
            url: `/rooms/${emptyRoomId}/leave`,
            headers: outsideHeaders,
            payload: {},
        });
        expect(leaveEmptyRoomResponse.statusCode).toBe(200);
        expect(leaveEmptyRoomResponse.json()).toMatchObject({
            success: true,
            data: {
                status: "CLOSED",
            },
            errorCode: "none",
            errorMessage: "",
        });

        const joinClosedRoomResponse = await app.inject({
            method: "POST",
            url: "/rooms/join-by-code",
            headers: secondaryHeaders,
            payload: {
                roomCode: emptyRoomCode,
            },
        });
        expect(joinClosedRoomResponse.statusCode).toBe(400);
        expect(joinClosedRoomResponse.json()).toMatchObject({
            success: false,
            errorMessage: "房间已关闭",
        });

        const loginResponse = await app.inject({
            method: "POST",
            url: "/auth/login",
            payload: {
                username: "test-user",
                password: "123456",
            },
        });
        expect(loginResponse.statusCode).toBe(200);
        const loginBody = loginResponse.json() as {
            success: boolean;
            data?: {
                token: string;
            };
        };
        expect(loginBody.success).toBe(true);
        expect(loginBody.data?.token).toBeTypeOf("string");

        const meResponse = await app.inject({
            method: "GET",
            url: "/auth/me",
            headers: createAuthHeaders(loginBody.data?.token ?? ""),
        });
        expect(meResponse.statusCode).toBe(200);
        expect(meResponse.json()).toMatchObject({
            success: true,
            data: {
                username: "test-user",
            },
            errorCode: "none",
            errorMessage: "",
        });

        await app.close();
    });
});

/**
 * 测试内注册用户并返回会话，避免保护路由依赖匿名默认身份。
 */
async function registerTestUser(
    app: {
        inject: (input: {
            method: string;
            url: string;
            payload?: unknown;
        }) => Promise<{
            statusCode: number;
            json: () => {
                success: boolean;
                data?: TestAuthSession;
            };
        }>;
    },
    input: {
        username: string;
        nickname: string;
    },
): Promise<TestAuthSession> {
    const response = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
            username: input.username,
            password: "123456",
            nickname: input.nickname,
        },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data?.token).toBeTypeOf("string");
    expect(body.data?.user).toMatchObject({
        username: input.username,
        nickname: input.nickname,
    });
    return body.data!;
}

/**
 * 构造测试请求头，token 只进入请求头，不写入日志或断言文本。
 */
function createAuthHeaders(token: string): Record<string, string> {
    return {
        authorization: `Bearer ${token}`,
    };
}

/**
 * 测试中使用的最小认证会话结构。
 */
interface TestAuthSession {
    token: string; // 会话令牌。
    user: {
        id: string; // 用户唯一标识。
        username: string; // 登录账号。
        nickname: string; // 用户昵称。
    };
}
