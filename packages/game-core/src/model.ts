/**
 * 游戏核心模型定义。
 *
 * 本文件只描述 `game-core` 内部权威状态结构，包括玩家、桌面牌位、轮内角色、轮内战斗状态、对局配置和操作结果。
 * `engine` 与各个 `gameplay` 模块都以这些接口传递状态；前端和服务端不应直接臆造这些字段，
 * 对外展示数据需要通过 `view` 或 `contracts` 中的 DTO 转换。
 */
import {
    CardDTO,
    CardRank,
    CardSuit,
    GameErrorCode,
    GameEventDTO,
    GameMode,
    GamePhase,
    PlayerIdentityDTO,
    PlayerStatus,
    PlayerType,
    RoundResult,
} from "@gonghua/contracts";

/**
 * 服务端保存的真实玩家状态，包含该玩家完整手牌。
 */
export interface PlayerState {
    playerId: string; // 玩家唯一标识。
    accountId?: string; // 玩家账号标识，当前可为临时账号或机器人账号。
    seat: number; // 玩家座位序号。
    name: string; // 玩家展示名称。
    playerType?: PlayerType; // 玩家类型；旧测试状态未传时根据 isBot 兼容推导。
    botProfileId?: string; // 机器人账号配置标识，真人玩家为空。
    avatarUrl?: string; // 玩家头像地址。
    isBot: boolean; // 是否为机器人玩家。
    status: PlayerStatus; // 玩家参与状态。
    handCards: CardDTO[]; // 玩家当前完整手牌。
    rank?: number; // 玩家出完手牌后记录的名次。
}

/**
 * 真实桌面牌位状态，每组牌位维护一张攻牌和可选守牌。
 */
export interface TablePairState {
    pairId: string; // 桌面牌位唯一标识。
    attackCard: CardDTO; // 进入桌面的攻牌。
    defendCard?: CardDTO; // 覆盖该攻牌的守牌。
}

/**
 * 当前轮角色关系，所有座位计算必须基于该结构。
 */
export interface RoundRoleState {
    attackSeat: number; // 当前主攻方座位。
    defendSeat: number; // 当前受攻方座位。
    supportSeats: number[]; // 当前助攻方座位。
    currentTurnSeat: number; // 当前应行动座位。
}

/**
 * 当前轮攻防状态，记录封攻和轮结果。
 */
export interface RoundBattleState {
    isAttackSealed: boolean; // 当前轮是否已经封攻。
    sealCardRank?: CardRank; // 触发封攻的大小王点数。
    stoppedAttackSeats: number[]; // 当前轮已经声明停止进攻的主攻或助攻座位。
    roundResult: RoundResult; // 当前轮结果。
}

/**
 * 对局配置，集中保存会影响初始状态生成的参数。
 */
export interface GameConfig {
    mode: GameMode; // 当前对局模式，只影响外围展示和服务编排，不参与牌面大小判断。
    playerCount: number; // 本局玩家数量。
    initialHandSize: number; // 初始发牌数量。
    seed: number; // 洗牌随机种子。
}

/**
 * 服务端权威对局状态，所有真实牌归属都必须能在这里找到。
 */
export interface GameState {
    gameId: string; // 对局唯一标识。
    stateVersion: number; // 服务端权威状态版本，每次成功动作后递增。
    phase: GamePhase; // 当前对局阶段。
    players: PlayerState[]; // 玩家真实状态列表。
    deck: CardDTO[]; // 当前牌堆，底部主牌仍包含在该数组内。
    trumpCard: CardDTO; // 牌堆底部主牌。
    trumpSuit: CardSuit; // 当前主花色。
    isNoRefillMode: boolean; // 是否已经进入只出不添阶段。
    tablePairs: TablePairState[]; // 当前桌面攻守牌位。
    discardPile: CardDTO[]; // 受攻成功后进入的弃牌区。
    config: GameConfig; // 当前对局配置。
    roundRoleState: RoundRoleState; // 当前轮角色关系。
    roundBattleState: RoundBattleState; // 当前轮攻防状态。
}

/**
 * 游戏核心操作结果，统一表达成功状态、失败原因和事件输出。
 */
export interface GameOperationResult {
    success: boolean; // 操作是否成功。
    gameState?: GameState; // 成功后的最新权威状态。
    events: GameEventDTO[]; // 本次操作产生的事件。
    errorCode: GameErrorCode; // 失败时的业务错误码。
    errorMessage: string; // 失败时的中文错误说明。
}

/**
 * 创建对局选项，允许测试和服务端注入稳定参数。
 */
export interface CreateGameOptions {
    gameId?: string; // 外部指定的对局标识。
    playerCount?: number; // 本局玩家数量。
    players?: PlayerIdentityDTO[]; // 外部传入的玩家身份快照，优先于默认玩家生成。
    seed?: number; // 指定洗牌随机种子。
    currentPlayerId?: string; // 当前真人玩家标识。
    enableBots?: boolean; // 是否启用非当前玩家机器人身份，默认启用。
    mode?: GameMode; // 当前对局模式，未传时按普通对局处理。
}

/**
 * 牌数守恒校验结果，用于定位状态归属异常。
 */
export interface CardConservationResult {
    success: boolean; // 是否通过守恒校验。
    totalCards: number; // 所有区域统计到的总牌数。
    deckCount: number; // 牌堆数量。
    handCount: number; // 全部玩家手牌数量。
    tableCount: number; // 桌面区牌数量。
    discardCount: number; // 弃牌区数量。
    errorMessage: string; // 校验失败原因。
}
