/**
 * 防守动作模块。
 *
 * 本文件包含受攻方相关动作：`playDefenseCard`、`recallDefenseCard`、`moveDefenseCard`、`giveUpDefense`
 * 和 `collectTableCards`。出守牌、撤回和移动会把状态交给 `createProgressResult` 继续推进；
 * 放弃防守进入收牌阶段，确认收牌则在满足停攻条件后调用轮结算逻辑。共享能力通过 `DefenseActionContext` 注入，
 * 避免本模块反向依赖完整 `engine`。
 */
import {
    CardDTO,
    CardRank,
    GameErrorCode,
    GameEventDTO,
    GameEventType,
    GamePhase,
    PlayerStatus,
    RoundResult,
} from "@gonghua/contracts";
import {
    GameOperationResult,
    GameState,
    PlayerState,
    RoundBattleState,
} from "../model";
import { settleRound } from "./roundSettlement";
import { logGameAction } from "../logger";
import { areDefensesValid, canDefendCard, isDefenseSeat } from "../rules";

/**
 * 防守动作依赖的引擎上下文，避免该模块直接持有完整状态机入口。
 */
export interface DefenseActionContext {
    cloneGameState: (gameState: GameState) => GameState; // 克隆权威状态。
    createFailure: (
        errorCode: GameErrorCode,
        errorMessage: string,
    ) => GameOperationResult; // 创建失败结果。
    createProgressResult: (
        gameState: GameState,
        events: GameEventDTO[],
    ) => GameOperationResult; // 创建进度推进结果。
    createSealedBattleState: (
        current: RoundBattleState,
        sealCardRank: CardRank,
    ) => RoundBattleState; // 创建封攻状态。
    findPlayerBySeat: (players: PlayerState[], seat: number) => PlayerState; // 按座位查找玩家。
    removeCardFromHand: (
        player: PlayerState,
        cardId: string,
    ) => CardDTO | undefined; // 从手牌移除卡牌。
}

/**
 * 处理受攻方打出守牌覆盖指定攻牌的动作。
 */
export function playDefenseCard(
    gameState: GameState,
    actor: PlayerState,
    cardId: string,
    targetPairId: string,
    context: DefenseActionContext,
): GameOperationResult {
    if (gameState.phase !== GamePhase.ROUND_ACTIVE) {
        return context.createFailure(
            GameErrorCode.INVALID_PHASE,
            "当前阶段不能打出守牌",
        );
    }
    if (!isDefenseSeat(actor.seat, gameState.roundRoleState)) {
        return context.createFailure(
            GameErrorCode.ROLE_NOT_ALLOWED,
            "只有受攻方可以打出守牌",
        );
    }
    /** 目标牌位必须存在，守牌只能覆盖一张明确攻牌。 */
    const pairIndex = gameState.tablePairs.findIndex(
        (pair) => pair.pairId === targetPairId,
    );
    if (pairIndex < 0) {
        return context.createFailure(
            GameErrorCode.PAIR_NOT_FOUND,
            "防守目标牌位不存在",
        );
    }
    const pair = gameState.tablePairs[pairIndex];
    if (pair === undefined) {
        return context.createFailure(
            GameErrorCode.PAIR_NOT_FOUND,
            "防守目标牌位不存在",
        );
    }
    if (pair.defendCard !== undefined) {
        return context.createFailure(
            GameErrorCode.PAIR_ALREADY_DEFENDED,
            "目标牌位已经存在守牌",
        );
    }
    /** 守牌必须来自受攻方当前手牌。 */
    const card = actor.handCards.find((item) => item.id === cardId);
    if (card === undefined) {
        return context.createFailure(
            GameErrorCode.CARD_NOT_IN_HAND,
            "守牌不在受攻方手牌中",
        );
    }
    if (!canDefendCard(pair.attackCard, card, gameState.trumpSuit)) {
        return context.createFailure(
            GameErrorCode.DEFENSE_NOT_HIGHER,
            "当前守牌不能合法压制目标攻牌",
        );
    }

    /** 防守动作在状态副本中完成，便于失败时保留原状态。 */
    const nextState = context.cloneGameState(gameState);
    /** 副本中的受攻方玩家。 */
    const nextActor = context.findPlayerBySeat(nextState.players, actor.seat);
    /** 从手牌中移除并得到进入桌面的守牌。 */
    const nextCard = context.removeCardFromHand(nextActor, cardId);
    /** 副本中的目标牌位，用于写入守牌。 */
    const nextPair = nextState.tablePairs[pairIndex];
    if (nextCard === undefined || nextPair === undefined) {
        return context.createFailure(
            GameErrorCode.STATE_INCONSISTENT,
            "防守动作写入状态失败",
        );
    }
    nextPair.defendCard = nextCard;
    if (nextCard.isSealCard) {
        nextState.roundBattleState = context.createSealedBattleState(
            nextState.roundBattleState,
            nextCard.rank,
        );
    }
    logGameAction("round", "play_defense_card", {
        gameId: nextState.gameId,
        phase: nextState.phase,
        actorSeat: actor.seat,
        cardLabel: nextCard.label,
        targetPairId,
        isAttackSealed: nextState.roundBattleState.isAttackSealed,
    });

    return context.createProgressResult(nextState, [
        {
            type: GameEventType.DEFENSE_CARD_PLAYED,
            playerId: actor.playerId,
            cardId,
            targetPairId,
            message: nextCard.isSealCard
                ? `${actor.name} 打出 守牌：${nextCard.label}，系统 开启 封攻`
                : `${actor.name} 打出 守牌：${nextCard.label} 防守 ${nextPair.attackCard.label}`,
        },
    ]);
}

/**
 * 处理受攻方撤回已放置守牌的动作。
 */
export function recallDefenseCard(
    gameState: GameState,
    actor: PlayerState,
    sourcePairId: string,
    context: DefenseActionContext,
): GameOperationResult {
    if (gameState.phase !== GamePhase.ROUND_ACTIVE) {
        return context.createFailure(
            GameErrorCode.INVALID_PHASE,
            "当前阶段不能撤回守牌",
        );
    }
    if (!isDefenseSeat(actor.seat, gameState.roundRoleState)) {
        return context.createFailure(
            GameErrorCode.ROLE_NOT_ALLOWED,
            "只有受攻方可以撤回守牌",
        );
    }
    /** 来源牌位必须存在且已经有守牌。 */
    const pairIndex = gameState.tablePairs.findIndex(
        (pair) => pair.pairId === sourcePairId,
    );
    const pair = gameState.tablePairs[pairIndex];
    if (pair === undefined) {
        return context.createFailure(
            GameErrorCode.PAIR_NOT_FOUND,
            "守牌来源牌位不存在",
        );
    }
    if (pair.defendCard === undefined) {
        return context.createFailure(
            GameErrorCode.INVALID_ACTION_ARGUMENT,
            "来源牌位没有可撤回守牌",
        );
    }

    /** 撤回动作在状态副本中完成，失败时不污染原状态。 */
    const nextState = context.cloneGameState(gameState);
    /** 副本中的来源牌位。 */
    const nextPair = nextState.tablePairs[pairIndex];
    /** 副本中的受攻方玩家，接收撤回的守牌。 */
    const nextActor = context.findPlayerBySeat(nextState.players, actor.seat);
    if (nextPair === undefined || nextPair.defendCard === undefined) {
        return context.createFailure(
            GameErrorCode.STATE_INCONSISTENT,
            "撤回守牌写入状态失败",
        );
    }
    /** 被撤回的守牌会重新回到受攻方手牌。 */
    const recalledCard = nextPair.defendCard;
    delete nextPair.defendCard;
    nextActor.handCards.push(recalledCard);
    logGameAction("round", "recall_defense_card", {
        gameId: nextState.gameId,
        phase: nextState.phase,
        actorSeat: actor.seat,
        cardLabel: recalledCard.label,
        sourcePairId,
    });

    return context.createProgressResult(nextState, [
        {
            type: GameEventType.DEFENSE_CARD_RECALLED,
            playerId: actor.playerId,
            cardId: recalledCard.id,
            sourcePairId,
            message: `${actor.name} 撤回 守牌：${recalledCard.label}`,
        },
    ]);
}

/**
 * 处理受攻方调整守牌位置的动作。
 */
export function moveDefenseCard(
    gameState: GameState,
    actor: PlayerState,
    sourcePairId: string,
    targetPairId: string,
    context: DefenseActionContext,
): GameOperationResult {
    if (gameState.phase !== GamePhase.ROUND_ACTIVE) {
        return context.createFailure(
            GameErrorCode.INVALID_PHASE,
            "当前阶段不能移动守牌",
        );
    }
    if (!isDefenseSeat(actor.seat, gameState.roundRoleState)) {
        return context.createFailure(
            GameErrorCode.ROLE_NOT_ALLOWED,
            "只有受攻方可以移动守牌",
        );
    }
    if (sourcePairId === targetPairId) {
        return context.createFailure(
            GameErrorCode.INVALID_ACTION_ARGUMENT,
            "守牌移动需要不同的来源和目标牌位",
        );
    }
    /** 来源牌位索引，用于找到当前要移动的守牌。 */
    const sourceIndex = gameState.tablePairs.findIndex(
        (pair) => pair.pairId === sourcePairId,
    );
    /** 目标牌位索引，用于放置或交换守牌。 */
    const targetIndex = gameState.tablePairs.findIndex(
        (pair) => pair.pairId === targetPairId,
    );
    if (sourceIndex < 0 || targetIndex < 0) {
        return context.createFailure(
            GameErrorCode.PAIR_NOT_FOUND,
            "来源或目标牌位不存在",
        );
    }
    const sourcePair = gameState.tablePairs[sourceIndex];
    if (sourcePair?.defendCard === undefined) {
        return context.createFailure(
            GameErrorCode.INVALID_ACTION_ARGUMENT,
            "来源牌位没有可移动守牌",
        );
    }

    /** 守牌移动先在副本中完成，再统一校验全部守牌合法性。 */
    const nextState = context.cloneGameState(gameState);
    /** 副本中的来源牌位。 */
    const nextSource = nextState.tablePairs[sourceIndex];
    /** 副本中的目标牌位。 */
    const nextTarget = nextState.tablePairs[targetIndex];
    if (nextSource?.defendCard === undefined || nextTarget === undefined) {
        return context.createFailure(
            GameErrorCode.STATE_INCONSISTENT,
            "移动守牌写入状态失败",
        );
    }
    /** 来源守牌是必须被移动的牌。 */
    const sourceCard = nextSource.defendCard;
    /** 目标守牌存在时执行交换，不存在时执行单向移动。 */
    const targetCard = nextTarget.defendCard;
    if (targetCard === undefined) {
        delete nextSource.defendCard;
    } else {
        nextSource.defendCard = targetCard;
    }
    nextTarget.defendCard = sourceCard;

    if (!areDefensesValid(nextState.tablePairs, nextState.trumpSuit)) {
        return context.createFailure(
            GameErrorCode.DEFENSE_MOVE_INVALID,
            "守牌移动后存在无法压制对应攻牌的牌位",
        );
    }
    logGameAction("round", "move_defense_card", {
        gameId: nextState.gameId,
        phase: nextState.phase,
        actorSeat: actor.seat,
        sourcePairId,
        targetPairId,
    });

    return context.createProgressResult(nextState, [
        {
            type: GameEventType.DEFENSE_CARD_MOVED,
            playerId: actor.playerId,
            sourcePairId,
            targetPairId,
            message: `${actor.name} 移动 守牌：${sourceCard.label} 到 ${nextTarget.attackCard.label}`,
        },
    ]);
}

/**
 * 处理受攻方主动放弃继续防守的动作。
 */
export function giveUpDefense(
    gameState: GameState,
    actor: PlayerState,
    context: DefenseActionContext,
): GameOperationResult {
    if (gameState.phase !== GamePhase.ROUND_ACTIVE) {
        return context.createFailure(
            GameErrorCode.INVALID_PHASE,
            "当前阶段不能放弃防守",
        );
    }
    if (!isDefenseSeat(actor.seat, gameState.roundRoleState)) {
        return context.createFailure(
            GameErrorCode.ROLE_NOT_ALLOWED,
            "只有受攻方可以放弃防守",
        );
    }
    /** 放弃防守后先进入收牌追加阶段，攻击方仍可继续追加合法攻牌。 */
    const nextState = context.cloneGameState(gameState);
    nextState.phase = GamePhase.DEFENSE_COLLECTING;
    nextState.roundBattleState.roundResult = RoundResult.DEFENSE_FAILED;
    logGameAction("round", "give_up_defense", {
        gameId: nextState.gameId,
        from: gameState.phase,
        to: nextState.phase,
        actorSeat: actor.seat,
        tablePairCount: nextState.tablePairs.length,
        roundResult: nextState.roundBattleState.roundResult,
    });
    return context.createProgressResult(nextState, [
        {
            type: GameEventType.DEFENSE_GIVEN_UP,
            playerId: actor.playerId,
            message: `${actor.name} 放弃 防守，系统 进入 收牌追加阶段`,
        },
    ]);
}

/**
 * 处理受攻失败后的确认收牌动作，把桌面所有牌归入受攻方手牌。
 */
export function collectTableCards(
    gameState: GameState,
    actor: PlayerState,
    context: DefenseActionContext,
): GameOperationResult {
    if (gameState.phase !== GamePhase.DEFENSE_COLLECTING) {
        return context.createFailure(
            GameErrorCode.INVALID_PHASE,
            "当前阶段不能确认收牌",
        );
    }
    if (!isDefenseSeat(actor.seat, gameState.roundRoleState)) {
        return context.createFailure(
            GameErrorCode.ROLE_NOT_ALLOWED,
            "只有受攻方可以确认收牌",
        );
    }
    if (!allAttackStopped(gameState)) {
        return context.createFailure(
            GameErrorCode.INVALID_ACTION_ARGUMENT,
            "主攻方和助攻方尚未全部停止进攻，不能确认收牌",
        );
    }

    /** 确认收牌只在攻击方全部停攻后执行，并立即进入轮后补牌和下轮轮转。 */
    const nextState = context.cloneGameState(gameState);
    logGameAction("round", "collect_table_cards", {
        gameId: nextState.gameId,
        from: gameState.phase,
        to: GamePhase.FIRST_ATTACK_READY,
        actorSeat: actor.seat,
        roundResult: nextState.roundBattleState.roundResult,
    });

    const events: GameEventDTO[] = [
        {
            type: GameEventType.ROUND_RESULT_READY,
            playerId: actor.playerId,
            message: "系统 生成 受攻失败结果",
        },
    ];
    return context.createProgressResult(
        settleRound(nextState, RoundResult.DEFENSE_FAILED, events),
        events,
    );
}

/**
 * 判断当前轮所有攻击角色是否均已停止进攻或已完成排名。
 */
function allAttackStopped(gameState: GameState): boolean {
    return [
        gameState.roundRoleState.attackSeat,
        ...gameState.roundRoleState.supportSeats,
    ].every((seat) => {
        const player = gameState.players.find((item) => item.seat === seat);
        return (
            player?.status === PlayerStatus.FINISHED ||
            gameState.roundBattleState.stoppedAttackSeats.includes(seat)
        );
    });
}
