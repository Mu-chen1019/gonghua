/**
 * 对局主协议，集中定义核心状态机、前端和服务端共同使用的游戏结构。
 */

/**
 * 卡牌花色枚举，用于区分普通花色与大小王无花色状态。
 */
export enum CardSuit {
    HEART = "heart", // 红桃。
    DIAMOND = "diamond", // 方块。
    SPADE = "spade", // 黑桃。
    CLUB = "club", // 梅花。
    NONE = "none", // 大小王等不属于普通花色的牌。
}

/**
 * 卡牌点数枚举，统一约束牌面比较、展示和动作提交中的点数值。
 */
export enum CardRank {
    ACE = "A", // A 点。
    TWO = "2", // 2 点。
    THREE = "3", // 3 点。
    FOUR = "4", // 4 点。
    FIVE = "5", // 5 点。
    SIX = "6", // 6 点。
    SEVEN = "7", // 7 点。
    EIGHT = "8", // 8 点。
    NINE = "9", // 9 点。
    TEN = "10", // 10 点。
    JACK = "J", // J 点。
    QUEEN = "Q", // Q 点。
    KING = "K", // K 点。
    SMALL_JOKER = "small_joker", // 小王。
    BIG_JOKER = "big_joker", // 大王。
}

/**
 * 玩家状态枚举，用于标记玩家是否仍参与当前对局。
 */
export enum PlayerStatus {
    ACTIVE = "active", // 玩家仍在对局中。
    FINISHED = "finished", // 玩家已经完成排名或离开后续行动。
}

/**
 * 玩家类型枚举，用于区分真人账号和机器人账号。
 */
export enum PlayerType {
    HUMAN = "human", // 真人玩家。
    BOT = "bot", // 机器人玩家。
}

/**
 * 对局模式枚举，用于区分普通房间局和单人人机局。
 */
export enum GameMode {
    NORMAL = "normal", // 普通对局，后续用于真人房间和联机。
    HUMAN_VS_BOTS = "human_vs_bots", // 单人人机对局，除当前玩家外默认由机器人补位。
}

/**
 * 对局结束原因枚举，用于区分正常结算和人为终止。
 */
export enum GameFinishReason {
    NORMAL_FINISH = "normal_finish", // 正常规则结算结束。
    PLAYER_EXIT = "player_exit", // 人机模式中玩家主动退出。
    RESTART = "restart", // 人机模式中玩家重新开始导致旧局终止。
}

/**
 * 当前轮玩家角色枚举，用于前端展示和后端动作权限判断。
 */
export enum PlayerRole {
    MAIN_ATTACK = "main_attack", // 当前轮主攻方。
    DEFENSE = "defense", // 当前轮受攻方。
    SUPPORT = "support", // 当前轮助攻方。
}

/**
 * 对局阶段枚举，描述当前状态机允许哪些动作继续推进。
 */
export enum GamePhase {
    TRUMP_EXCHANGE_READY = "trump_exchange_ready", // 有玩家可用更小主牌换底。
    FIRST_ATTACK_READY = "first_attack_ready", // 首攻方等待打出首张攻牌。
    ROUND_ACTIVE = "round_active", // 当前轮攻防进行中。
    WAITING_DEFENSE_REFILL = "waiting_defense_refill", // 受攻方空手且仍需中途添牌。
    DEFENSE_COLLECTING = "defense_collecting", // 受攻失败后，攻击方仍可追加可攻牌，等待受攻方收牌。
    ROUND_RESULT_READY = "round_result_ready", // 当前轮结果已形成，等待结算进入下一轮。
    GAME_OVER = "game_over", // 对局已结束并生成最终排名。
}

/**
 * 当前轮结果枚举，用于轮结算阶段判断桌面牌归属。
 */
export enum RoundResult {
    NONE = "none", // 当前轮尚未产生结果。
    DEFENSE_SUCCESS = "defense_success", // 受攻方已防住全部攻牌。
    DEFENSE_FAILED = "defense_failed", // 受攻方放弃或无法继续防守。
}

/**
 * 玩家动作类型枚举，所有前端提交的对局动作必须使用这里定义的值。
 */
export enum GameActionType {
    EXCHANGE_TRUMP_CARD = "exchange_trump_card", // 玩家用手中最小可换主牌与牌堆底部主牌换底。
    PLAY_ATTACK_CARD = "play_attack_card", // 打出首攻牌或追加攻牌。
    PLAY_ATTACK_CARDS = "play_attack_cards", // 一次性打出多张首攻牌或追加攻牌。
    PLAY_DEFENSE_CARD = "play_defense_card", // 受攻方打出守牌覆盖指定攻牌。
    RECALL_DEFENSE_CARD = "recall_defense_card", // 受攻方撤回已放置的守牌。
    MOVE_DEFENSE_CARD = "move_defense_card", // 受攻方调整已放置守牌的位置。
    STOP_ATTACK = "stop_attack", // 主攻方或助攻方声明本轮不再继续进攻。
    GIVE_UP_DEFENSE = "give_up_defense", // 受攻方主动放弃继续防守。
    COLLECT_TABLE_CARDS = "collect_table_cards", // 受攻失败后确认收取桌面全部牌。
}

/**
 * 业务错误码枚举，用于接口响应和前端错误提示分流。
 */
export enum GameErrorCode {
    NONE = "none", // 无错误。
    GAME_NOT_FOUND = "game_not_found", // 对局不存在。
    PLAYER_NOT_FOUND = "player_not_found", // 玩家不存在。
    INVALID_PHASE = "invalid_phase", // 当前阶段不允许该动作。
    INVALID_ACTOR = "invalid_actor", // 动作发起玩家非法。
    ROLE_NOT_ALLOWED = "role_not_allowed", // 当前角色无权执行该动作。
    NOT_CURRENT_ACTOR = "not_current_actor", // 当前尚未轮到该玩家行动。
    INVALID_ACTION_ARGUMENT = "invalid_action_argument", // 动作参数不合法。
    CARD_NOT_IN_HAND = "card_not_in_hand", // 指定卡牌不在玩家手牌中。
    PAIR_NOT_FOUND = "pair_not_found", // 指定桌面牌位不存在。
    PAIR_ALREADY_DEFENDED = "pair_already_defended", // 指定牌位已经存在守牌。
    DEFENSE_NOT_HIGHER = "defense_not_higher", // 守牌无法压制目标攻牌。
    ATTACK_RANK_NOT_MATCHED = "attack_rank_not_matched", // 追加攻牌未命中桌面已有点数。
    ATTACK_SEALED = "attack_sealed", // 当前轮已封攻且不允许该攻牌。
    ATTACK_ALREADY_STOPPED = "attack_already_stopped", // 当前攻击方已经停止进攻。
    DEFENSE_MOVE_INVALID = "defense_move_invalid", // 守牌移动后出现非法防守关系。
    ROUND_ALREADY_FINISHED = "round_already_finished", // 当前轮结果已经形成。
    WAITING_DEFENSE_REFILL = "waiting_defense_refill", // 当前等待受攻方中途添牌。
    STATE_INCONSISTENT = "state_inconsistent", // 状态归属或牌数守恒异常。
    STATE_VERSION_CONFLICT = "state_version_conflict", // 客户端提交版本与服务端最新版本不一致。
    VALIDATION_ERROR = "validation_error", // 接口参数校验失败。
}

/**
 * 对局事件类型枚举，用于记录动作结果并驱动前端事件提示。
 */
export enum GameEventType {
    GAME_CREATED = "game_created", // 对局已经创建。
    CARDS_DEALT = "cards_dealt", // 初始手牌已经发放。
    TRUMP_REVEALED = "trump_revealed", // 主花色和底部主牌已经确定。
    FIRST_ATTACK_READY = "first_attack_ready", // 首攻角色已经确定。
    ATTACK_CARD_PLAYED = "attack_card_played", // 攻牌已经进入桌面。
    DEFENSE_CARD_PLAYED = "defense_card_played", // 守牌已经覆盖目标攻牌。
    DEFENSE_CARD_RECALLED = "defense_card_recalled", // 守牌已经撤回手牌。
    DEFENSE_CARD_MOVED = "defense_card_moved", // 守牌位置已经调整。
    ATTACK_STOPPED = "attack_stopped", // 攻击方已经停止进攻。
    DEFENSE_GIVEN_UP = "defense_given_up", // 受攻方已经放弃防守。
    TABLE_CARDS_COLLECTED = "table_cards_collected", // 受攻方已经收取桌面全部牌。
    TABLE_CARDS_DISCARDED = "table_cards_discarded", // 受攻成功后桌面牌已经进入弃牌区。
    ROUND_CARDS_REFILLED = "round_cards_refilled", // 轮后补牌已经完成。
    ROUND_RESULT_READY = "round_result_ready", // 当前轮结果已经形成。
    NEXT_ROUND_READY = "next_round_ready", // 下一轮角色和首攻状态已经准备完成。
    DEFENSE_REFILL_REQUIRED = "defense_refill_required", // 受攻方需要中途添牌。
    DEFENSE_CARDS_REFILLED = "defense_cards_refilled", // 受攻方中途添牌已经完成。
    TRUMP_CARD_EXCHANGED = "trump_card_exchanged", // 玩家已经完成主牌换底。
    BOT_ACTION_SELECTED = "bot_action_selected", // 机器人已经选择下一步自动动作。
    NO_REFILL_STARTED = "no_refill_started", // 牌堆耗尽后进入只出不添。
    PLAYER_FINISHED = "player_finished", // 玩家已经出完手牌并记录名次。
    GAME_OVER = "game_over", // 对局已经结束。
}

/**
 * 前后端共享卡牌结构，表示一张牌在当前玩家视角下的展示和规则属性。
 */
export interface CardDTO {
    id: string; // 卡牌唯一标识，用于状态流转中避免同点同花牌混淆。
    suit: CardSuit; // 卡牌花色，大小王使用无花色。
    rank: CardRank; // 卡牌点数。
    label: string; // 面向用户展示的牌面文本。
    isSealCard: boolean; // 是否为大小王封牌。
    isTrump: boolean; // 是否为当前主花色普通牌。
}

/**
 * 玩家视角结构，只暴露当前玩家允许看到的玩家信息。
 */
export interface PlayerViewDTO {
    playerId: string; // 玩家唯一标识。
    accountId?: string; // 玩家账号标识，游客或临时机器人账号也使用该字段承接身份。
    playerType: PlayerType; // 玩家类型，用于后续区分真人账号和机器人账号。
    botProfileId?: string; // 机器人账号配置标识，真人玩家为空。
    avatarUrl?: string; // 玩家头像地址，未配置时由前端使用默认头像。
    seat: number; // 玩家座位序号，用于顺时针关系计算。
    name: string; // 玩家展示名称。
    isBot: boolean; // 是否为机器人玩家。
    status: PlayerStatus; // 玩家当前参与状态。
    role: PlayerRole; // 玩家在当前轮中的角色。
    handCount: number; // 玩家当前手牌数量。
    handCards: CardDTO[]; // 当前玩家和机器人可见的手牌；非机器人对手必须为空数组。
    isCurrentPlayer: boolean; // 是否为当前客户端代表的玩家。
    isCurrentTurn: boolean; // 是否轮到该玩家执行当前动作。
    canAct: boolean; // 当前阶段该玩家是否有可提交动作。
    actionHint: string; // 当前阶段该玩家的中文操作提示。
    rank?: number; // 玩家已完成时的名次。
}

/**
 * 创建对局时传入核心层的玩家身份快照。
 */
export interface PlayerIdentityDTO {
    playerId: string; // 对局内玩家唯一标识。
    accountId?: string; // 玩家账号标识，当前单机可使用临时账号。
    seat: number; // 玩家座位序号。
    name: string; // 玩家展示名称。
    playerType: PlayerType; // 玩家类型。
    botProfileId?: string; // 机器人账号配置标识。
    avatarUrl?: string; // 玩家头像地址。
}

/**
 * 玩家排名结构，用于对局结束或只出不添阶段展示已完成玩家名次。
 */
export interface PlayerRankDTO {
    playerId: string; // 玩家唯一标识。
    seat: number; // 玩家座位序号。
    name: string; // 玩家展示名称。
    rank: number; // 玩家当前名次。
}

/**
 * 桌面攻守牌位结构，每个牌位最多包含一张攻牌和一张守牌。
 */
export interface TablePairDTO {
    pairId: string; // 桌面牌位唯一标识。
    attackCard: CardDTO; // 该牌位上的攻牌。
    defendCard?: CardDTO; // 该牌位上的守牌，未防住时为空。
}

/**
 * 当前轮角色状态，描述攻守座位关系和当前行动座位。
 */
export interface RoundRoleStateDTO {
    attackSeat: number; // 当前轮主攻方座位。
    defendSeat: number; // 当前轮受攻方座位。
    supportSeats: number[]; // 当前轮助攻方座位列表。
    currentTurnSeat: number; // 当前应行动的玩家座位。
}

/**
 * 当前轮战斗状态，描述封攻和本轮结果。
 */
export interface RoundBattleStateDTO {
    isAttackSealed: boolean; // 当前轮是否已经被受攻方大小王封攻。
    sealCardRank?: CardRank; // 触发封攻的大小王点数，用于限制另一张王的追加。
    stoppedAttackSeats: number[]; // 当前轮已经声明停止进攻的主攻或助攻座位。
    roundResult: RoundResult; // 当前轮结果。
}

/**
 * 前端消费的完整玩家视角状态，不包含其他玩家不可见手牌。
 */
export interface GameViewStateDTO {
    gameId: string; // 对局唯一标识。
    stateVersion: number; // 当前玩家视角对应的服务端状态版本。
    localPlayerId: string; // 当前客户端代表的玩家标识。
    mode: GameMode; // 当前对局模式，用于页面决定是否展示人机局专属操作。
    phase: GamePhase; // 当前对局阶段。
    trumpSuit: CardSuit; // 当前主花色。
    trumpCard: CardDTO; // 当前牌堆底部主牌。
    deckCount: number; // 当前牌堆剩余数量。
    discardCount: number; // 当前弃牌区数量。
    isNoRefillMode: boolean; // 是否已经进入只出不添阶段。
    players: PlayerViewDTO[]; // 玩家视角列表。
    rankings: PlayerRankDTO[]; // 当前已经产生的玩家名次。
    tablePairs: TablePairDTO[]; // 当前桌面攻守牌位。
    roundRoleState: RoundRoleStateDTO; // 当前轮角色关系。
    roundBattleState: RoundBattleStateDTO; // 当前轮战斗状态。
    message: string; // 当前状态提示文案。
}

/**
 * 前端可提交的动作联合类型，每个分支对应一个明确的对局意图。
 */
export type GameActionDTO =
    | { actionType: GameActionType.EXCHANGE_TRUMP_CARD }
    | { actionType: GameActionType.PLAY_ATTACK_CARD; cardId: string }
    | { actionType: GameActionType.PLAY_ATTACK_CARDS; cardIds: string[] }
    | {
          actionType: GameActionType.PLAY_DEFENSE_CARD;
          cardId: string;
          targetPairId: string;
      }
    | { actionType: GameActionType.RECALL_DEFENSE_CARD; sourcePairId: string }
    | {
          actionType: GameActionType.MOVE_DEFENSE_CARD;
          sourcePairId: string;
          targetPairId: string;
      }
    | { actionType: GameActionType.STOP_ATTACK }
    | { actionType: GameActionType.GIVE_UP_DEFENSE }
    | { actionType: GameActionType.COLLECT_TABLE_CARDS };

/**
 * 对局事件结构，用于向前端提示本次状态变化的原因。
 */
export interface GameEventDTO {
    type: GameEventType; // 事件类型。
    playerId?: string; // 事件关联玩家。
    cardId?: string; // 事件关联卡牌。
    sourcePairId?: string; // 事件关联的来源桌面牌位。
    targetPairId?: string; // 事件关联的目标桌面牌位。
    message: string; // 面向用户或调试的事件说明。
}
