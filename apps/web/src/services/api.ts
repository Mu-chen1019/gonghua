/**
 * 前端接口请求模块，负责封装对局相关 HTTP 通信。
 */
import type {
    ApiResponse,
    AuthSessionDTO,
    CreateGameDTO,
    CreateRoomDTO,
    FinishGameDTO,
    GameRecordListDTO,
    GameMutationResponseDTO,
    JoinRoomByCodeDTO,
    JoinRoomDTO,
    ListGameRecordsQueryDTO,
    LoginDTO,
    PlayerStatDTO,
    RegisterDTO,
    RoomDTO,
    RoomStartGameResponseDTO,
    StartRoomGameDTO,
    SubmitGameActionDTO,
    UpdateRoomReadyDTO,
    UpdateUserSettingDTO,
    UserDTO,
    UserSettingDTO,
} from "@gonghua/contracts";
import { GameErrorCode, GameFinishReason } from "@gonghua/contracts";
import { useAuthStore } from "../stores/authStore";
import { logWebGameAction } from "../utils/gameLogger";

/** 后端接口基础地址，开发环境默认走 Vite 代理。 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

/**
 * 前端接口错误，保留后端业务错误码，便于页面按错误类型处理。
 */
export class ApiError extends Error {
    errorCode: GameErrorCode; // 后端返回的业务错误码。

    /**
     * 创建带业务错误码的接口错误。
     */
    constructor(message: string, errorCode: GameErrorCode) {
        super(message);
        this.name = "ApiError";
        this.errorCode = errorCode;
    }
}

/**
 * 请求后端创建新对局。
 */
export async function createGame(
    input: CreateGameDTO,
): Promise<GameMutationResponseDTO> {
    logWebGameAction("api", "create_game_start", {
        route: "POST /games",
        playerCount: input.playerCount,
        ...(input.mode === undefined ? {} : { message: input.mode }),
    });
    return request<GameMutationResponseDTO>("/games", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

/**
 * 主动结束人机对局，退出和重新开始都先把旧局标记为已结束。
 */
export async function finishGame(
    gameId: string,
    input: FinishGameDTO,
): Promise<GameMutationResponseDTO> {
    logWebGameAction("api", "finish_game", {
        route: "POST /games/:gameId/finish",
        gameId,
        playerId: input.playerId,
        message:
            input.finishReason === GameFinishReason.RESTART
                ? "重新开始"
                : "退出游戏",
    });
    return request<GameMutationResponseDTO>(`/games/${gameId}/finish`, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

/**
 * 请求指定玩家视角下的对局状态。
 */
export async function getGame(
    gameId: string,
): Promise<GameMutationResponseDTO> {
    logWebGameAction("api", "get_game_start", {
        route: "GET /games/:gameId",
        gameId,
    });
    return request<GameMutationResponseDTO>(`/games/${gameId}`);
}

/**
 * 向后端提交玩家动作，并获取动作后的最新玩家视角。
 */
export async function submitGameAction(
    gameId: string,
    input: SubmitGameActionDTO,
): Promise<GameMutationResponseDTO> {
    logWebGameAction("api", "submit_action_start", {
        route: "POST /games/:gameId/actions",
        gameId,
        playerId: input.playerId,
        ...(input.clientActionId === undefined
            ? {}
            : { clientActionId: input.clientActionId }),
        ...(input.stateVersion === undefined
            ? {}
            : { stateVersion: input.stateVersion }),
        roundAction: input.action.actionType,
    });
    return request<GameMutationResponseDTO>(`/games/${gameId}/actions`, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

/**
 * 请求后端推进一个机器人动作，用于前端按固定延迟展示机器人过程。
 */
export async function submitBotStep(
    gameId: string,
    playerId: string,
): Promise<GameMutationResponseDTO> {
    logWebGameAction("api", "submit_bot_step_start", {
        route: "POST /games/:gameId/bot-step",
        gameId,
        playerId,
    });
    return request<GameMutationResponseDTO>(`/games/${gameId}/bot-step`, {
        method: "POST",
        body: JSON.stringify({ playerId }),
    });
}

/**
 * 查询最近对局记录，用于开始页提供继续对局入口。
 */
export async function listGameRecords(
    query: ListGameRecordsQueryDTO = {},
): Promise<GameRecordListDTO> {
    logWebGameAction("api", "list_game_records", {
        route: "GET /records/games",
    });
    const searchParams = new URLSearchParams();
    if (query.limit !== undefined) {
        searchParams.set("limit", String(query.limit));
    }
    const queryString = searchParams.toString();
    return request<GameRecordListDTO>(
        queryString.length === 0
            ? "/records/games"
            : `/records/games?${queryString}`,
    );
}

/**
 * 注册账号并返回当前登录会话。
 */
export async function register(input: RegisterDTO): Promise<AuthSessionDTO> {
    logWebGameAction("api", "register_user", {
        route: "POST /auth/register",
        name: input.username,
    });
    return request<AuthSessionDTO>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

/**
 * 登录账号并返回当前登录会话。
 */
export async function login(input: LoginDTO): Promise<AuthSessionDTO> {
    logWebGameAction("api", "login_user", {
        route: "POST /auth/login",
        name: input.username,
    });
    return request<AuthSessionDTO>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

/**
 * 使用会话令牌查询当前登录用户。
 */
export async function getCurrentUser(token: string): Promise<UserDTO> {
    return request<UserDTO>("/auth/me", {
        headers: createAuthHeaders(token),
    });
}

/**
 * 登出当前会话。
 */
export async function logout(token: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>("/auth/logout", {
        method: "POST",
        headers: createAuthHeaders(token),
    });
}

/**
 * 查询当前登录用户配置，前端不再拼接用户标识。
 */
export async function getMyUserSetting(): Promise<UserSettingDTO> {
    return request<UserSettingDTO>("/users/me/settings");
}

/**
 * 更新当前登录用户配置，前端不再拼接用户标识。
 */
export async function updateMyUserSetting(
    input: UpdateUserSettingDTO,
): Promise<UserSettingDTO> {
    return request<UserSettingDTO>("/users/me/settings", {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

/**
 * 查询当前登录用户战绩，前端不再拼接用户标识。
 */
export async function getMyPlayerStat(): Promise<PlayerStatDTO> {
    return request<PlayerStatDTO>("/users/me/stats");
}

/**
 * 创建房间并返回房间快照。
 */
export async function createRoom(input: CreateRoomDTO): Promise<RoomDTO> {
    logWebGameAction("api", "create_room", {
        route: "POST /rooms",
        playerCount: input.playerCount,
    });
    return request<RoomDTO>("/rooms", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

/**
 * 查询指定房间快照。
 */
export async function getRoom(roomId: string): Promise<RoomDTO> {
    logWebGameAction("api", "get_room", {
        route: "GET /rooms/:roomId",
        message: roomId,
    });
    return request<RoomDTO>(`/rooms/${encodeURIComponent(roomId)}`);
}

/**
 * 加入指定房间。
 */
export async function joinRoom(
    roomId: string,
    input: JoinRoomDTO,
): Promise<RoomDTO> {
    logWebGameAction("api", "join_room", {
        route: "POST /rooms/:roomId/join",
        message: roomId,
    });
    return request<RoomDTO>(`/rooms/${encodeURIComponent(roomId)}/join`, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

/**
 * 按房间号加入房间，成功后返回包含真实房间 id 的房间快照。
 */
export async function joinRoomByCode(
    input: JoinRoomByCodeDTO,
): Promise<RoomDTO> {
    logWebGameAction("api", "join_room", {
        route: "POST /rooms/join-by-code",
        message: input.roomCode,
    });
    return request<RoomDTO>("/rooms/join-by-code", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

/**
 * 更新房间内玩家准备状态。
 */
export async function updateRoomReady(
    roomId: string,
    input: UpdateRoomReadyDTO,
): Promise<RoomDTO> {
    logWebGameAction("api", "set_room_ready", {
        route: "POST /rooms/:roomId/ready",
        message: roomId,
    });
    return request<RoomDTO>(`/rooms/${encodeURIComponent(roomId)}/ready`, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

/**
 * 房主从房间开始对局。
 */
export async function startRoomGame(
    roomId: string,
    input: StartRoomGameDTO,
): Promise<RoomStartGameResponseDTO> {
    logWebGameAction("api", "start_room_game", {
        route: "POST /rooms/:roomId/start",
        message: roomId,
    });
    return request<RoomStartGameResponseDTO>(
        `/rooms/${encodeURIComponent(roomId)}/start`,
        {
            method: "POST",
            body: JSON.stringify(input),
        },
    );
}

/**
 * 执行标准 HTTP 请求并解包后端统一响应。
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
    logWebGameAction("api", "request_start", {
        route: path,
    });
    /** 原始响应对象，用于同时判断 HTTP 状态和业务状态。 */
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    const token = resolveRequestToken(path);
    if (token !== undefined && !headers.has("authorization")) {
        headers.set("authorization", `Bearer ${token}`);
    }
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers,
    });
    /** 先读取原始文本，避免后端未启动或代理失败时空响应触发浏览器 JSON 解析错误。 */
    const responseText = await response.text();
    if (responseText.length === 0) {
        logWebGameAction("api", "request_empty_response", {
            route: path,
            success: false,
        });
        throw new Error(
            response.ok
                ? "后端响应为空"
                : "后端服务不可用，请确认已启动 pnpm dev:server",
        );
    }
    /** 后端标准响应体。 */
    const payload = parseApiResponse<T>(responseText);
    if (!response.ok || !payload.success || payload.data === undefined) {
        logWebGameAction("api", "request_failed", {
            route: path,
            errorCode: payload.errorCode,
            errorMessage: payload.errorMessage,
            success: false,
        });
        throw new ApiError(
            payload.errorMessage || "请求失败",
            payload.errorCode,
        );
    }
    logWebGameAction("api", "request_success", {
        route: path,
        success: true,
    });
    return payload.data;
}

/**
 * 构造认证请求头，调用方负责保证 token 不进入日志。
 */
function createAuthHeaders(token: string): HeadersInit {
    return {
        authorization: `Bearer ${token}`,
    };
}

/**
 * 读取当前请求应使用的会话令牌，登录和注册请求不能携带旧账号 token。
 */
function resolveRequestToken(path: string): string | undefined {
    if (path === "/auth/login" || path === "/auth/register") {
        return undefined;
    }
    return useAuthStore.getState().session?.token;
}

/**
 * 解析后端标准响应，失败时返回可读错误而不是浏览器原生解析异常。
 */
function parseApiResponse<T>(responseText: string): ApiResponse<T> {
    try {
        return JSON.parse(responseText) as ApiResponse<T>;
    } catch {
        logWebGameAction("api", "parse_response_failed", {
            errorMessage: "后端响应不是合法 JSON",
            success: false,
        });
        throw new Error("后端响应不是合法 JSON，请检查服务端是否正常运行");
    }
}
