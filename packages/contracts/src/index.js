/**
 * 共享协议的运行时代码，保留给 JavaScript 消费方使用；字段说明以同目录 TypeScript 源文件为准。
 */
/** 卡牌花色枚举运行时定义。 */
export var CardSuit;
(function (CardSuit) {
    CardSuit["HEART"] = "heart";
    CardSuit["DIAMOND"] = "diamond";
    CardSuit["SPADE"] = "spade";
    CardSuit["CLUB"] = "club";
    CardSuit["NONE"] = "none";
})(CardSuit || (CardSuit = {}));
/** 卡牌点数枚举运行时定义。 */
export var CardRank;
(function (CardRank) {
    CardRank["ACE"] = "A";
    CardRank["TWO"] = "2";
    CardRank["THREE"] = "3";
    CardRank["FOUR"] = "4";
    CardRank["FIVE"] = "5";
    CardRank["SIX"] = "6";
    CardRank["SEVEN"] = "7";
    CardRank["EIGHT"] = "8";
    CardRank["NINE"] = "9";
    CardRank["TEN"] = "10";
    CardRank["JACK"] = "J";
    CardRank["QUEEN"] = "Q";
    CardRank["KING"] = "K";
    CardRank["SMALL_JOKER"] = "small_joker";
    CardRank["BIG_JOKER"] = "big_joker";
})(CardRank || (CardRank = {}));
/** 玩家状态枚举运行时定义。 */
export var PlayerStatus;
(function (PlayerStatus) {
    PlayerStatus["ACTIVE"] = "active";
    PlayerStatus["FINISHED"] = "finished";
})(PlayerStatus || (PlayerStatus = {}));
/** 当前轮玩家角色枚举运行时定义。 */
export var PlayerRole;
(function (PlayerRole) {
    PlayerRole["MAIN_ATTACK"] = "main_attack";
    PlayerRole["DEFENSE"] = "defense";
    PlayerRole["SUPPORT"] = "support";
})(PlayerRole || (PlayerRole = {}));
/** 对局阶段枚举运行时定义。 */
export var GamePhase;
(function (GamePhase) {
    GamePhase["FIRST_ATTACK_READY"] = "first_attack_ready";
    GamePhase["ROUND_ACTIVE"] = "round_active";
    GamePhase["WAITING_DEFENSE_REFILL"] = "waiting_defense_refill";
    GamePhase["ROUND_RESULT_READY"] = "round_result_ready";
})(GamePhase || (GamePhase = {}));
/** 当前轮结果枚举运行时定义。 */
export var RoundResult;
(function (RoundResult) {
    RoundResult["NONE"] = "none";
    RoundResult["DEFENSE_SUCCESS"] = "defense_success";
    RoundResult["DEFENSE_FAILED"] = "defense_failed";
})(RoundResult || (RoundResult = {}));
/** 玩家动作类型枚举运行时定义。 */
export var GameActionType;
(function (GameActionType) {
    GameActionType["PLAY_ATTACK_CARD"] = "play_attack_card";
    GameActionType["PLAY_DEFENSE_CARD"] = "play_defense_card";
    GameActionType["RECALL_DEFENSE_CARD"] = "recall_defense_card";
    GameActionType["MOVE_DEFENSE_CARD"] = "move_defense_card";
    GameActionType["GIVE_UP_DEFENSE"] = "give_up_defense";
})(GameActionType || (GameActionType = {}));
/** 业务错误码枚举运行时定义。 */
export var GameErrorCode;
(function (GameErrorCode) {
    GameErrorCode["NONE"] = "none";
    GameErrorCode["GAME_NOT_FOUND"] = "game_not_found";
    GameErrorCode["PLAYER_NOT_FOUND"] = "player_not_found";
    GameErrorCode["INVALID_PHASE"] = "invalid_phase";
    GameErrorCode["INVALID_ACTOR"] = "invalid_actor";
    GameErrorCode["ROLE_NOT_ALLOWED"] = "role_not_allowed";
    GameErrorCode["NOT_CURRENT_ACTOR"] = "not_current_actor";
    GameErrorCode["INVALID_ACTION_ARGUMENT"] = "invalid_action_argument";
    GameErrorCode["CARD_NOT_IN_HAND"] = "card_not_in_hand";
    GameErrorCode["PAIR_NOT_FOUND"] = "pair_not_found";
    GameErrorCode["PAIR_ALREADY_DEFENDED"] = "pair_already_defended";
    GameErrorCode["DEFENSE_NOT_HIGHER"] = "defense_not_higher";
    GameErrorCode["ATTACK_RANK_NOT_MATCHED"] = "attack_rank_not_matched";
    GameErrorCode["ATTACK_SEALED"] = "attack_sealed";
    GameErrorCode["DEFENSE_MOVE_INVALID"] = "defense_move_invalid";
    GameErrorCode["ROUND_ALREADY_FINISHED"] = "round_already_finished";
    GameErrorCode["WAITING_DEFENSE_REFILL"] = "waiting_defense_refill";
    GameErrorCode["STATE_INCONSISTENT"] = "state_inconsistent";
    GameErrorCode["VALIDATION_ERROR"] = "validation_error";
})(GameErrorCode || (GameErrorCode = {}));
/** 对局事件类型枚举运行时定义。 */
export var GameEventType;
(function (GameEventType) {
    GameEventType["GAME_CREATED"] = "game_created";
    GameEventType["CARDS_DEALT"] = "cards_dealt";
    GameEventType["TRUMP_REVEALED"] = "trump_revealed";
    GameEventType["FIRST_ATTACK_READY"] = "first_attack_ready";
    GameEventType["ATTACK_CARD_PLAYED"] = "attack_card_played";
    GameEventType["DEFENSE_CARD_PLAYED"] = "defense_card_played";
    GameEventType["DEFENSE_CARD_RECALLED"] = "defense_card_recalled";
    GameEventType["DEFENSE_CARD_MOVED"] = "defense_card_moved";
    GameEventType["DEFENSE_GIVEN_UP"] = "defense_given_up";
    GameEventType["ROUND_RESULT_READY"] = "round_result_ready";
    GameEventType["DEFENSE_REFILL_REQUIRED"] = "defense_refill_required";
})(GameEventType || (GameEventType = {}));
