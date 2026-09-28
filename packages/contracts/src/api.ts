/**
 * 接口响应协议，集中定义前后端 HTTP 通信返回结构。
 */
import type {
    GameErrorCode,
    GameEventDTO,
    GameFinishReason,
    GameMode,
    GameViewStateDTO,
} from "./game";
import type { GameActionDTO } from "./game";

/**
 * 标准接口响应结构，所有后端业务接口都应返回该包装格式。
 */
export interface ApiResponse<T> {
    success: boolean; // 请求是否成功。
    data?: T; // 成功时返回的业务数据。
    errorCode: GameErrorCode; // 业务错误码。
    errorMessage: string; // 错误或空字符串提示。
}

/**
 * 创建对局请求结构。
 */
export interface CreateGameDTO {
    playerCount: number; // 本局玩家数量。
    currentPlayerId?: string; // 当前创建对局的玩家标识，登录态接口可由 token 推导。
    mode?: GameMode; // 对局模式，未传时后端按普通对局处理。
    seed?: number; // 可选洗牌随机种子，主要用于测试和复现。
}

/**
 * 会改变或刷新对局状态的接口响应结构。
 */
export interface GameMutationResponseDTO {
    viewState: GameViewStateDTO; // 最新玩家视角状态。
    events: GameEventDTO[]; // 本次操作产生的事件列表。
    hasPendingBotAction: boolean; // 是否仍有机器人动作等待自动推进。
}

/**
 * 对局主记录响应结构，对应当前最小数据库中的 Game 表。
 */
export interface GameRecordDTO {
    id: string; // 对局唯一标识。
    roomId?: string; // 房间标识，当前单机阶段通常为空。
    mode: GameMode; // 对局模式。
    status: string; // 对局状态。
    currentPhase: string; // 当前对局阶段。
    stateVersion: number; // 对局状态版本号。
    finishReason?: GameFinishReason; // 对局结束原因，未结束时为空。
    startedAt: string; // 对局开始时间 ISO 字符串。
    finishedAt?: string; // 对局结束时间 ISO 字符串，未结束时为空。
    createdAt: string; // 对局记录创建时间 ISO 字符串。
    updatedAt: string; // 对局记录更新时间 ISO 字符串。
}

/**
 * 对局记录列表响应结构，后续分页前先返回最近一批记录。
 */
export interface GameRecordListDTO {
    records: GameRecordDTO[]; // 对局记录列表。
}

/**
 * 查询对局记录请求结构。
 */
export interface ListGameRecordsQueryDTO {
    userId?: string; // 用户标识，传入时只查询该用户参与过的对局。
    limit?: number; // 返回数量上限。
}

/**
 * 提交对局动作请求结构，用于版本校验和动作幂等。
 */
export interface SubmitGameActionDTO {
    playerId: string; // 发起动作的玩家标识。
    action: GameActionDTO; // 玩家提交的具体动作。
    clientActionId?: string; // 客户端生成的动作唯一标识，用于重复请求幂等。
    stateVersion?: number; // 客户端提交动作时看到的状态版本。
}

/**
 * 主动结束对局请求结构，当前只允许人机模式触发。
 */
export interface FinishGameDTO {
    playerId: string; // 发起结束的玩家标识。
    finishReason: GameFinishReason; // 结束原因，用于区分退出和重新开始。
}

/**
 * 用户个人配置响应结构，对应后端 UserSetting 表。
 */
export interface UserSettingDTO {
    userId: string; // 用户唯一标识。
    autoSortEnabled: boolean; // 是否开启手牌自动排序。
    botLevel: string; // 默认机器人等级，当前仅保存配置值。
    soundEnabled: boolean; // 是否开启音效。
    animationEnabled: boolean; // 是否开启动画。
    showEventPanel: boolean; // 是否显示事件栏。
    createdAt?: string; // 配置创建时间 ISO 字符串，未落库时为空。
    updatedAt?: string; // 配置更新时间 ISO 字符串，未落库时为空。
}

/**
 * 用户基础信息响应结构，不包含密码摘要和会话凭证。
 */
export interface UserDTO {
    id: string; // 用户唯一标识。
    username?: string; // 登录账号，游客或历史本地用户可能为空。
    nickname: string; // 用户昵称。
    avatarUrl?: string; // 用户头像地址。
    status: string; // 用户账号状态。
    createdAt?: string; // 用户创建时间 ISO 字符串。
    updatedAt?: string; // 用户更新时间 ISO 字符串。
}

/**
 * 注册请求结构。
 */
export interface RegisterDTO {
    username: string; // 登录账号。
    password: string; // 登录密码，仅用于请求传输，服务端必须保存摘要。
    nickname?: string; // 用户昵称，未传时使用账号名。
}

/**
 * 登录请求结构。
 */
export interface LoginDTO {
    username: string; // 登录账号。
    password: string; // 登录密码，仅用于请求传输。
}

/**
 * 登录会话响应结构。
 */
export interface AuthSessionDTO {
    user: UserDTO; // 当前登录用户。
    token: string; // 当前会话令牌，前端只存储和请求传递，不写入日志。
    expiresAt: string; // 会话过期时间 ISO 字符串。
}

/**
 * 更新用户个人配置请求结构，字段全部可选，未传字段沿用当前配置或默认值。
 */
export interface UpdateUserSettingDTO {
    autoSortEnabled?: boolean; // 是否开启手牌自动排序。
    botLevel?: string; // 默认机器人等级。
    soundEnabled?: boolean; // 是否开启音效。
    animationEnabled?: boolean; // 是否开启动画。
    showEventPanel?: boolean; // 是否显示事件栏。
}

/**
 * 对局动作日志记录响应结构，对应 GameAction 表。
 */
export interface GameActionRecordDTO {
    id: string; // 动作日志唯一标识。
    gameId: string; // 对局唯一标识。
    clientActionId?: string; // 客户端动作幂等标识，未接入时为空。
    playerId?: string; // 玩家标识，系统动作为空。
    seat?: number; // 座位号，无法定位时为空。
    actorType: string; // 动作来源。
    actionType: string; // 动作类型。
    payloadJson: unknown; // 动作参数 JSON。
    beforeVersion: number; // 动作前版本。
    afterVersion?: number; // 动作后版本，失败动作为空。
    success: boolean; // 动作是否成功。
    errorCode?: string; // 失败错误码，成功时为空。
    errorMessage?: string; // 失败中文说明，成功时为空。
    eventJson?: unknown; // 动作产生的事件 JSON。
    createdAt: string; // 动作创建时间 ISO 字符串。
}

/**
 * 对局动作日志列表响应结构。
 */
export interface GameActionRecordListDTO {
    records: GameActionRecordDTO[]; // 对局动作日志列表。
}

/**
 * 对局结果响应结构，对应 GameResult 表。
 */
export interface GameResultDTO {
    gameId: string; // 对局唯一标识。
    winnerUserId?: string; // 第一名用户标识。
    rankingsJson: unknown; // 完整排名 JSON。
    scoreJson?: unknown; // 计分 JSON，当前预留为空对象。
    createdAt: string; // 结果创建时间 ISO 字符串。
}

/**
 * 房间成员响应结构，对应 RoomPlayer 表。
 */
export interface RoomPlayerDTO {
    id: string; // 房间成员关系唯一标识。
    roomId: string; // 房间唯一标识。
    userId: string; // 用户唯一标识。
    nickname?: string; // 用户昵称，用于生成游戏内玩家展示名。
    seat: number; // 房间内座位序号。
    playerType: string; // 玩家类型。
    ready: boolean; // 是否已经准备。
    onlineStatus: string; // 在线状态。
    joinedAt: string; // 加入时间 ISO 字符串。
    leftAt?: string; // 离开时间 ISO 字符串，仍在房间时为空。
}

/**
 * 房间响应结构，对应 Room 表，并包含成员快照。
 */
export interface RoomDTO {
    id: string; // 房间唯一标识。
    roomCode: string; // 房间号。
    ownerUserId: string; // 房主用户标识。
    currentGameId?: string; // 房间当前未结束对局标识，房间开始后用于成员自动进入对局。
    status: string; // 房间状态。
    playerCount: number; // 目标玩家数量。
    botFillEnabled: boolean; // 是否允许机器人补位。
    createdAt: string; // 房间创建时间 ISO 字符串。
    updatedAt: string; // 房间更新时间 ISO 字符串。
    closedAt?: string; // 房间关闭时间 ISO 字符串，未关闭时为空。
    players: RoomPlayerDTO[]; // 房间成员列表。
}

/**
 * 创建房间请求结构。
 */
export interface CreateRoomDTO {
    ownerUserId?: string; // 房主用户标识，登录态接口可由 token 推导。
    playerCount: number; // 目标玩家数量。
    botFillEnabled?: boolean; // 是否允许机器人补位。
}

/**
 * 房间开始对局请求结构。
 */
export interface StartRoomGameDTO {
    ownerUserId?: string; // 发起开始对局的房主用户标识，登录态接口可由 token 推导。
    seed?: number; // 可选洗牌随机种子，主要用于测试和复现。
}

/**
 * 房间开始对局响应结构。
 */
export interface RoomStartGameResponseDTO {
    room: RoomDTO; // 开始对局后的房间快照。
    game: GameMutationResponseDTO; // 房主视角下的新对局状态。
}

/**
 * 加入房间请求结构。
 */
export interface JoinRoomDTO {
    userId?: string; // 用户唯一标识，登录态接口可由 token 推导。
    playerType?: string; // 玩家类型，默认真人。
}

/**
 * 按房间号加入房间请求结构，用户身份仍由登录态推导。
 */
export interface JoinRoomByCodeDTO {
    roomCode: string; // 用户输入的房间号，服务端会去空格并统一转大写。
    playerType?: string; // 玩家类型，默认真人。
}

/**
 * 更新房间准备状态请求结构。
 */
export interface UpdateRoomReadyDTO {
    userId?: string; // 用户唯一标识，登录态接口可由 token 推导。
    ready: boolean; // 是否准备。
}

/**
 * 玩家统计响应结构，对应 PlayerStat 表。
 */
export interface PlayerStatDTO {
    userId: string; // 用户唯一标识。
    totalGames: number; // 总对局数。
    winGames: number; // 第一名次数。
    averageRank: number; // 平均名次。
    lastGameAt?: string; // 最近完成对局时间。
    updatedAt?: string; // 统计更新时间 ISO 字符串。
}

/**
 * 玩家排行榜响应结构。
 */
export interface PlayerStatListDTO {
    records: PlayerStatDTO[]; // 玩家统计列表。
}
