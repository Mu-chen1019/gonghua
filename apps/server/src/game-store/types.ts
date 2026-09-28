/**
 * 对局仓库类型模块。
 *
 * 本文件定义服务端对局存取的最小接口，路由和业务服务不关心底层是内存、PostgreSQL 还是其他存储。
 * `GameRepository` 负责权威 `GameState` 的读取和保存，`GameActionLogRepository` 先预留动作日志写入边界；
 * 后续接 Prisma 时新增数据库实现即可，不需要改动路由层和核心规则层。
 */
import type {
    GameRecordDTO,
    GameActionDTO,
    GameActionRecordDTO,
    GameFinishReason,
    GameMode,
    GameErrorCode,
    GameEventDTO,
    GameResultDTO,
    GameMutationResponseDTO,
    PlayerIdentityDTO,
} from "@gonghua/contracts";
import type { GameState } from "@gonghua/game-core";

/**
 * 创建对局接口的仓库入参。
 */
export interface CreateStoredGameInput {
    playerCount: number; // 本局玩家数量。
    currentPlayerId: string; // 当前创建对局的玩家标识。
    currentPlayerName?: string; // 当前创建玩家的账号昵称，用于生成本局玩家展示名。
    mode?: GameMode; // 对局模式，未传时按普通对局创建。
    roomId?: string; // 对局所属房间，单机创建时为空。
    players?: PlayerIdentityDTO[]; // 外部传入的玩家身份列表，房间开始对局时使用。
    seed?: number; // 可选洗牌随机种子。
}

/**
 * 仓库统一返回结构，用于路由层包装接口响应。
 */
export interface StoreResult {
    success: boolean; // 操作是否成功。
    data?: GameMutationResponseDTO; // 成功时返回的玩家视角响应。
    errorCode: GameErrorCode; // 失败时的业务错误码。
    errorMessage: string; // 失败时的中文错误说明。
}

/**
 * 对局参与者查询结果，用于路由层区分对局不存在和用户无权访问。
 */
export interface GameParticipantResult {
    gameExists: boolean; // 对局是否存在于内存状态或可恢复快照中。
    isParticipant: boolean; // 指定用户是否为该对局玩家。
}

/**
 * 提交动作时的服务端控制上下文。
 */
export interface SubmitGameActionContext {
    clientActionId?: string; // 客户端动作幂等标识。
    stateVersion?: number; // 客户端提交动作时看到的状态版本。
}

/**
 * 对局状态仓库接口，后续数据库实现需要保持同样语义。
 */
export interface GameRepository {
    saveGame: (gameState: GameState) => void; // 保存最新权威对局状态。
    getGame: (gameId: string) => GameState | undefined; // 按对局标识读取权威状态。
}

/**
 * 动作日志写入内容，记录一次玩家、机器人或系统动作后的结果摘要。
 */
export interface GameActionLogEntry {
    gameId: string; // 对局唯一标识。
    playerId: string; // 触发动作或视角请求的玩家标识。
    clientActionId?: string; // 客户端动作幂等标识，机器人或系统动作可为空。
    action?: GameActionDTO; // 玩家或机器人提交的动作，查询类操作可为空。
    events: GameEventDTO[]; // 本次操作产生的事件。
    success: boolean; // 操作是否成功。
    errorCode: GameErrorCode; // 操作结果错误码。
    errorMessage: string; // 操作结果错误说明。
}

/**
 * 对局动作日志仓库接口，当前内存实现先保留边界，数据库阶段再落盘。
 */
export interface GameActionLogRepository {
    appendActionLog: (entry: GameActionLogEntry) => void | Promise<void>; // 追加一条动作日志。
    getActionLogByClientActionId: (
        gameId: string,
        clientActionId: string,
    ) => Promise<GameActionRecordDTO | undefined>; // 按客户端动作标识查询已执行记录。
    listActionLogs: (
        gameId: string,
        limit: number,
    ) => Promise<GameActionRecordDTO[]>; // 查询指定对局的动作日志。
}

/**
 * 成功动作后的事务型持久化入参。
 */
export interface PersistSuccessfulGameActionInput {
    gameState: GameState; // 成功动作后的最新权威状态。
    actionLogEntry: GameActionLogEntry; // 本次成功动作对应的日志内容。
}

/**
 * 成功动作后的持久化仓库接口，数据库实现需要保证主记录、快照和动作日志写入一致。
 */
export interface GameActionPersistenceRepository {
    persistSuccessfulAction: (
        input: PersistSuccessfulGameActionInput,
    ) => Promise<void>; // 事务保存成功动作后的数据库状态。
}

/**
 * 对局主记录持久化仓库接口，只负责当前最小 User 和 Game 两张表。
 */
export interface GameRecordRepository {
    upsertLocalUser: (input: LocalUserRecordInput) => Promise<void>; // 创建或更新本地用户主记录。
    createGameRecord: (
        gameState: GameState,
        input?: CreateGameRecordInput,
    ) => Promise<void>; // 创建对局主记录。
    updateGameRecord: (gameState: GameState) => Promise<void>; // 更新对局主记录阶段和状态。
    finishGameRecord: (
        gameState: GameState,
        input: FinishGameRecordInput,
    ) => Promise<void>; // 主动终止对局主记录，不写入正常胜负统计。
    syncGamePlayers: (gameState: GameState) => Promise<void>; // 同步对局玩家关系和已产生排名。
    getGameResult: (gameId: string) => Promise<GameResultDTO | undefined>; // 查询对局最终结果。
    listGameRecords: (input: ListGameRecordsInput) => Promise<GameRecordDTO[]>; // 查询最近对局主记录。
}

/**
 * 查询对局主记录的筛选条件。
 */
export interface ListGameRecordsInput {
    limit: number; // 返回数量上限。
    userId?: string; // 用户标识，传入时只返回该用户参与过的对局。
}

/**
 * 本地用户主记录入参，当前由创建对局的 currentPlayerId 映射而来。
 */
export interface LocalUserRecordInput {
    userId: string; // 用户唯一标识，当前单机阶段复用 currentPlayerId。
    nickname: string; // 用户昵称。
    avatarUrl?: string; // 用户头像地址。
}

/**
 * 创建对局主记录的持久化上下文。
 */
export interface CreateGameRecordInput {
    roomId?: string; // 对局所属房间，单机创建时为空。
    mode?: GameMode; // 对局模式，未传时从核心状态配置读取。
}

/**
 * 主动结束对局的持久化上下文。
 */
export interface FinishGameRecordInput {
    finishReason: GameFinishReason; // 主动结束原因。
}

/**
 * 创建对局后的事务型持久化入参。
 */
export interface PersistCreatedGameInput {
    gameState: GameState; // 创建完成后的初始权威状态。
    roomId?: string; // 对局所属房间，单机创建时为空。
    mode?: GameMode; // 对局模式，事务写入对局主记录时使用。
    localUser: LocalUserRecordInput; // 创建者用户主记录。
    actionLogEntry: GameActionLogEntry; // 开局系统事件日志。
}

/**
 * 创建对局后的持久化仓库接口，数据库实现需要保证主记录、初始快照和开局日志一致。
 */
export interface GameCreationPersistenceRepository {
    persistCreatedGame: (input: PersistCreatedGameInput) => Promise<void>; // 事务保存创建对局后的数据库状态。
}

/**
 * 对局快照仓库接口，负责保存和读取完整 GameState JSON。
 */
export interface GameSnapshotRepository {
    saveLatestSnapshot: (gameState: GameState) => Promise<void>; // 保存最新对局快照。
    getLatestSnapshot: (gameId: string) => Promise<GameState | undefined>; // 查询指定对局最新快照。
}
