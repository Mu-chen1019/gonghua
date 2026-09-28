/**
 * 日志协议和中文格式化工具，避免日志映射混入主对局协议。
 */

/**
 * 跨端日志上下文结构，用于前端、后端和核心引擎统一输出中文流程日志。
 */
export interface GameLogContextDTO {
    currentPage?: string; // 当前页面标识。
    gameId?: string; // 对局标识。
    playerId?: string; // 玩家标识。
    route?: string; // 当前接口或请求路径。
    phase?: string; // 当前对局阶段。
    from?: string; // 来源阶段或状态。
    to?: string; // 目标阶段或状态。
    reason?: string; // 失败或分支原因。
    errorMessage?: string; // 错误说明。
    engine?: string; // 当前对局引擎名称。
    name?: string; // 通用名称字段。
    players?: number; // 玩家数量。
    playerCount?: number; // 对局玩家数量。
    totalCards?: number; // 牌数守恒统计到的总牌数。
    deckCount?: number; // 当前牌堆数量。
    handCount?: number; // 当前手牌数量或总手牌数量。
    localCards?: number; // 当前玩家可见手牌数量。
    tableCards?: number; // 桌面牌数量。
    actions?: number; // 动作或事件数量。
    retryCount?: number; // 重试次数。
    trumpSuit?: string; // 当前主花色。
    trumpCard?: string; // 当前主牌标签。
    shuffleSeed?: number; // 洗牌种子。
    attackSeat?: number; // 当前主攻方座位。
    defendSeat?: number; // 当前受攻方座位。
    supportSeats?: string; // 当前助攻方座位列表。
    currentTurnSeat?: number; // 当前行动座位。
    decisionBasis?: string; // 规则判定依据。
    roundAction?: string; // 本次提交的动作类型。
    clientActionId?: string; // 客户端动作幂等标识。
    stateVersion?: number; // 客户端提交时看到的状态版本。
    latestStateVersion?: number; // 服务端当前最新状态版本。
    finishReason?: string; // 对局结束原因。
    actorSeat?: number; // 动作发起玩家座位。
    cardLabel?: string; // 当前动作卡牌标签。
    sourcePairId?: string; // 来源牌位标识。
    targetPairId?: string; // 目标牌位标识。
    tablePairCount?: number; // 当前桌面牌位数量。
    uncoveredPairCount?: number; // 未防住牌位数量。
    isAttackSealed?: boolean; // 当前轮是否封攻。
    roundResult?: string; // 当前轮结果。
    success?: boolean; // 当前动作或请求是否成功。
    errorCode?: string; // 业务错误码。
    message?: string; // 安全的补充说明。
}

/** 日志阶段中文映射，用于控制台和后端终端可读输出。 */
const logStageText: Record<string, string> = {
    api: "接口",
    game: "对局",
    page: "页面",
    round: "轮内流程",
    server: "服务",
    store: "状态仓库",
    bot: "机器人",
    ui: "界面操作",
};

/** 日志动作中文映射，用于把内部动作名转换成可读中文。 */
const logActionText: Record<string, string> = {
    action_complete: "动作完成",
    action_start: "动作开始",
    cards_dealt: "发牌完成",
    clear_selection: "清除选择",
    clear_notice: "清除提醒",
    collect_table_cards: "确认收牌",
    create: "创建对局",
    create_game: "创建对局",
    create_game_failed: "创建对局失败",
    create_game_saved: "保存新对局",
    create_game_start: "开始创建对局",
    create_room: "创建房间",
    error: "发生错误",
    exchange_trump_card: "换底",
    first_attack_decided: "首攻判定完成",
    get_game: "查询对局",
    get_game_not_found: "查询对局不存在",
    get_game_start: "开始查询对局",
    get_game_view: "生成对局视角",
    get_room: "查询房间",
    give_up_defense: "放弃防守",
    join_room: "加入房间",
    listen: "服务启动",
    list_game_records: "查询对局记录",
    login_user: "登录用户",
    move_defense_card: "移动守牌",
    parse_response_failed: "解析响应失败",
    play_attack_card: "打出攻牌",
    play_defense_card: "打出守牌",
    push_events: "更新事件",
    recall_defense_card: "撤回守牌",
    register_user: "注册用户",
    render_game: "渲染对局",
    request_empty_response: "响应为空",
    request_failed: "请求失败",
    request_start: "请求开始",
    request_success: "请求成功",
    select_card: "选择手牌",
    select_pair: "选择牌位",
    select_source_pair: "选择移动来源",
    select_target_pair: "选择移动目标",
    set_room_ready: "更新准备状态",
    show_notice: "显示提醒",
    submit_action: "提交动作",
    submit_action_failed: "提交动作失败",
    submit_action_not_found: "提交动作对局不存在",
    submit_action_saved: "保存动作结果",
    submit_action_repeated: "重复动作复用结果",
    submit_action_start: "开始提交动作",
    submit_action_success: "提交动作成功",
    submit_action_version_conflict: "提交动作版本冲突",
    submit_bot_step: "推进机器人",
    submit_bot_step_failed: "推进机器人失败",
    submit_bot_step_not_found: "推进机器人对局不存在",
    submit_bot_step_saved: "保存机器人动作",
    submit_bot_step_start: "开始推进机器人",
    submit_bot_step_success: "推进机器人成功",
    bot_action_selected: "机器人选择动作",
    start_room_game: "开始房间对局",
    stop_attack: "停止进攻",
    trump_revealed: "主牌确定",
};

/** 日志字段中文映射，控制最终输出中的 key 名称。 */
const logFieldText: Record<keyof GameLogContextDTO, string> = {
    currentPage: "当前页面",
    gameId: "对局",
    playerId: "玩家",
    route: "路由",
    phase: "阶段",
    from: "来源",
    to: "目标",
    reason: "原因",
    errorMessage: "错误说明",
    engine: "引擎",
    name: "名称",
    players: "玩家数",
    playerCount: "对局人数",
    totalCards: "总牌数",
    deckCount: "牌堆数",
    handCount: "手牌数",
    localCards: "本地手牌数",
    tableCards: "桌面牌数",
    actions: "数量",
    retryCount: "重试次数",
    trumpSuit: "主花色",
    trumpCard: "主牌",
    shuffleSeed: "洗牌种子",
    attackSeat: "主攻座位",
    defendSeat: "受攻座位",
    supportSeats: "助攻座位",
    currentTurnSeat: "当前行动座位",
    decisionBasis: "判定依据",
    roundAction: "动作",
    clientActionId: "客户端动作",
    stateVersion: "提交版本",
    latestStateVersion: "最新版本",
    finishReason: "结束原因",
    actorSeat: "操作座位",
    cardLabel: "卡牌",
    sourcePairId: "来源牌位",
    targetPairId: "目标牌位",
    tablePairCount: "桌面牌位数",
    uncoveredPairCount: "未防住牌位数",
    isAttackSealed: "是否封攻",
    roundResult: "轮结果",
    success: "是否成功",
    errorCode: "错误码",
    message: "说明",
};

/** 日志值中文映射，覆盖阶段、动作、错误码和常见枚举值。 */
const logValueText: Record<string, string> = {
    active: "进行中",
    attack_rank_not_matched: "加攻点数不匹配",
    attack_sealed: "已封攻",
    attack_already_stopped: "已经停止进攻",
    big_joker: "大王",
    card_not_in_hand: "卡牌不在手牌中",
    club: "梅花",
    collect_table_cards: "确认收牌",
    defense_collecting: "受攻失败待收牌",
    defense_failed: "受攻失败",
    defense_move_invalid: "守牌移动非法",
    defense_not_higher: "守牌无法压制",
    defense_success: "受攻成功",
    diamond: "方块",
    exchange_trump_card: "换底",
    first_attack_ready: "等待首攻",
    human_vs_bots: "人机模式",
    game_not_found: "对局不存在",
    give_up_defense: "放弃防守",
    heart: "红桃",
    invalid_action_argument: "动作参数不合法",
    invalid_actor: "动作玩家非法",
    invalid_phase: "阶段不允许",
    move_defense_card: "移动守牌",
    none: "无",
    not_current_actor: "未轮到该玩家",
    pair_already_defended: "牌位已防守",
    pair_not_found: "牌位不存在",
    play_attack_card: "打出攻牌",
    player_exit: "玩家退出",
    play_defense_card: "打出守牌",
    recall_defense_card: "撤回守牌",
    role_not_allowed: "角色不允许",
    round_active: "攻防进行中",
    round_already_finished: "本轮已结束",
    round_result_ready: "轮结果待结算",
    small_joker: "小王",
    spade: "黑桃",
    state_inconsistent: "状态不一致",
    state_version_conflict: "状态版本冲突",
    stop_attack: "停止进攻",
    normal: "普通模式",
    normal_finish: "正常结算",
    restart: "重新开始",
    trump_exchange_ready: "等待换底",
    validation_error: "参数校验失败",
    waiting_defense_refill: "等待受攻方添牌",
};

/** 日志字段输出顺序，保持三端输出稳定。 */
const logFieldOrder: Array<keyof GameLogContextDTO> = [
    "currentPage",
    "gameId",
    "playerId",
    "route",
    "phase",
    "from",
    "to",
    "reason",
    "errorMessage",
    "engine",
    "name",
    "players",
    "playerCount",
    "totalCards",
    "deckCount",
    "handCount",
    "localCards",
    "tableCards",
    "actions",
    "retryCount",
    "trumpSuit",
    "trumpCard",
    "shuffleSeed",
    "attackSeat",
    "defendSeat",
    "supportSeats",
    "currentTurnSeat",
    "decisionBasis",
    "roundAction",
    "clientActionId",
    "stateVersion",
    "latestStateVersion",
    "finishReason",
    "actorSeat",
    "cardLabel",
    "sourcePairId",
    "targetPairId",
    "tablePairCount",
    "uncoveredPairCount",
    "isAttackSealed",
    "roundResult",
    "success",
    "errorCode",
    "message",
];

/**
 * 格式化中文流程日志，供前端控制台和后端终端统一展示。
 */
export function formatChineseGameLog(
    stage: string,
    action: string,
    context?: GameLogContextDTO,
): string {
    /** 阶段和动作使用中文展示，内部调用仍可保留稳定英文标识。 */
    const currentTime = formatLogTime(new Date());
    const stageText = logStageText[stage] ?? stage;
    const actionText = logActionText[action] ?? action;
    const contextText = formatChineseLogContext(context);
    return contextText.length > 0
        ? `${currentTime} [${stageText}] ${actionText} | ${contextText}`
        : `${currentTime} [${stageText}] ${actionText}`;
}

/**
 * 将日志时间格式化为年月日时分秒，保证控制台和终端输出一致。
 */
function formatLogTime(date: Date): string {
    const year = date.getFullYear();
    const month = padTimePart(date.getMonth() + 1);
    const day = padTimePart(date.getDate());
    const hour = padTimePart(date.getHours());
    const minute = padTimePart(date.getMinutes());
    const second = padTimePart(date.getSeconds());
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * 将单个时间片段补齐到两位。
 */
function padTimePart(value: number): string {
    return String(value).padStart(2, "0");
}

/**
 * 将结构化日志上下文转换为中文 key=value 列表。
 */
function formatChineseLogContext(context?: GameLogContextDTO): string {
    if (context === undefined) {
        return "";
    }
    /** 只输出已传入字段，避免日志被 undefined 噪声干扰。 */
    const parts: string[] = [];
    for (const field of logFieldOrder) {
        const value = context[field];
        if (value !== undefined) {
            parts.push(`${logFieldText[field]}=${translateLogValue(value)}`);
        }
    }
    return parts.join("，");
}

/**
 * 翻译日志字段值，布尔值和常见枚举输出中文。
 */
function translateLogValue(value: string | number | boolean): string {
    if (typeof value === "boolean") {
        return value ? "是" : "否";
    }
    if (typeof value === "number") {
        return String(value);
    }
    return logValueText[value] ?? value;
}
