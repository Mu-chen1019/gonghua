/**
 * 合法动作枚举模块。
 *
 * 本文件以 `getLegalActions` 作为唯一对外入口，根据当前 `GameState` 和玩家身份枚举可提交动作。
 * 内部按动作类型拆成换底、攻牌、守牌、撤回守牌、移动守牌、停止进攻、放弃防守和确认收牌等创建函数，
 * 这些函数只做“当前能不能展示/尝试”的轻量判断，最终合法性仍由 `engine.applyGameAction` 和具体动作模块兜底。
 */
import {
    CardDTO,
    GameActionDTO,
    GameActionType,
    GamePhase,
    PlayerStatus,
} from "@gonghua/contracts";
import { GameState, PlayerState, TablePairState } from "./model";
import {
    areDefensesValid,
    canAddAttackCard,
    canDefendCard,
    getRankWeight,
    isAttackRoleSeat,
    isDefenseSeat,
    isMainAttackSeat,
} from "./rules";

/**
 * 获取指定玩家在当前状态下可提交的动作列表。
 */
export function getLegalActions(
    gameState: GameState,
    playerId: string,
): GameActionDTO[] {
    /** 玩家不存在、已完成或对局结束时不返回任何可操作动作。 */
    const actor = gameState.players.find(
        (player) => player.playerId === playerId,
    );
    if (
        actor === undefined ||
        actor.status !== PlayerStatus.ACTIVE ||
        gameState.phase === GamePhase.GAME_OVER
    ) {
        return [];
    }

    /** 换底不阻塞正常对局流程，任意非结束阶段都可作为可选动作出现。 */
    const actions = createExchangeActions(gameState, actor);
    if (gameState.phase === GamePhase.TRUMP_EXCHANGE_READY) {
        return actions;
    }
    if (
        gameState.phase === GamePhase.ROUND_RESULT_READY ||
        gameState.phase === GamePhase.WAITING_DEFENSE_REFILL
    ) {
        return actions;
    }
    actions.push(...createAttackActions(gameState, actor));
    actions.push(...createDefenseActions(gameState, actor));
    actions.push(...createRecallDefenseActions(gameState, actor));
    actions.push(...createMoveDefenseActions(gameState, actor));
    actions.push(...createStopAttackActions(gameState, actor));
    actions.push(...createGiveUpDefenseActions(gameState, actor));
    actions.push(...createCollectTableActions(gameState, actor));
    return actions;
}

/**
 * 创建玩家当前可执行的换底动作。
 */
function createExchangeActions(
    gameState: GameState,
    actor: PlayerState,
): GameActionDTO[] {
    /** 牌堆底牌不存在时不能再换底，避免牌堆耗尽后继续枚举旧主牌换底动作。 */
    const deckBottomCard = gameState.deck[gameState.deck.length - 1];
    if (deckBottomCard === undefined) {
        return [];
    }
    return findExchangeCard(actor.handCards, deckBottomCard) === undefined
        ? []
        : [{ actionType: GameActionType.EXCHANGE_TRUMP_CARD }];
}

/**
 * 创建玩家当前可执行的攻牌动作。
 */
function createAttackActions(
    gameState: GameState,
    actor: PlayerState,
): GameActionDTO[] {
    if (gameState.phase === GamePhase.FIRST_ATTACK_READY) {
        if (
            !isMainAttackSeat(actor.seat, gameState.roundRoleState) ||
            gameState.roundRoleState.currentTurnSeat !== actor.seat
        ) {
            return [];
        }
        return actor.handCards.map((card) => ({
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: card.id,
        }));
    }
    if (
        gameState.phase !== GamePhase.ROUND_ACTIVE &&
        gameState.phase !== GamePhase.DEFENSE_COLLECTING
    ) {
        return [];
    }
    if (
        !isAttackRoleSeat(actor.seat, gameState.roundRoleState) ||
        isAttackStopped(gameState, actor.seat)
    ) {
        return [];
    }
    return actor.handCards
        .filter((card) =>
            canAddAttackCard(
                card,
                gameState.tablePairs,
                gameState.roundBattleState.isAttackSealed,
                gameState.roundBattleState.sealCardRank,
            ),
        )
        .map((card) => ({
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: card.id,
        }));
}

/**
 * 创建玩家当前可执行的出守牌动作。
 */
function createDefenseActions(
    gameState: GameState,
    actor: PlayerState,
): GameActionDTO[] {
    if (
        gameState.phase !== GamePhase.ROUND_ACTIVE ||
        !isDefenseSeat(actor.seat, gameState.roundRoleState)
    ) {
        return [];
    }
    return actor.handCards.flatMap((card) =>
        gameState.tablePairs
            .filter(
                (pair) =>
                    pair.defendCard === undefined &&
                    canDefendCard(pair.attackCard, card, gameState.trumpSuit),
            )
            .map((pair) => ({
                actionType: GameActionType.PLAY_DEFENSE_CARD,
                cardId: card.id,
                targetPairId: pair.pairId,
            })),
    );
}

/**
 * 创建玩家当前可执行的撤回守牌动作。
 */
function createRecallDefenseActions(
    gameState: GameState,
    actor: PlayerState,
): GameActionDTO[] {
    if (
        gameState.phase !== GamePhase.ROUND_ACTIVE ||
        !isDefenseSeat(actor.seat, gameState.roundRoleState)
    ) {
        return [];
    }
    return gameState.tablePairs
        .filter((pair) => pair.defendCard !== undefined)
        .map((pair) => ({
            actionType: GameActionType.RECALL_DEFENSE_CARD,
            sourcePairId: pair.pairId,
        }));
}

/**
 * 创建玩家当前可执行的移动或交换守牌动作。
 */
function createMoveDefenseActions(
    gameState: GameState,
    actor: PlayerState,
): GameActionDTO[] {
    if (
        gameState.phase !== GamePhase.ROUND_ACTIVE ||
        !isDefenseSeat(actor.seat, gameState.roundRoleState)
    ) {
        return [];
    }
    return gameState.tablePairs.flatMap((sourcePair) => {
        if (sourcePair.defendCard === undefined) {
            return [];
        }
        return gameState.tablePairs
            .filter(
                (targetPair) =>
                    targetPair.pairId !== sourcePair.pairId &&
                    canMoveDefenseCard(
                        gameState.tablePairs,
                        gameState.trumpSuit,
                        sourcePair,
                        targetPair,
                    ),
            )
            .map((targetPair) => ({
                actionType: GameActionType.MOVE_DEFENSE_CARD,
                sourcePairId: sourcePair.pairId,
                targetPairId: targetPair.pairId,
            }));
    });
}

/**
 * 创建玩家当前可执行的停止进攻动作。
 */
function createStopAttackActions(
    gameState: GameState,
    actor: PlayerState,
): GameActionDTO[] {
    if (
        gameState.phase !== GamePhase.ROUND_ACTIVE &&
        gameState.phase !== GamePhase.DEFENSE_COLLECTING
    ) {
        return [];
    }
    if (
        !isAttackRoleSeat(actor.seat, gameState.roundRoleState) ||
        isAttackStopped(gameState, actor.seat)
    ) {
        return [];
    }
    return [{ actionType: GameActionType.STOP_ATTACK }];
}

/**
 * 创建玩家当前可执行的放弃防守动作。
 */
function createGiveUpDefenseActions(
    gameState: GameState,
    actor: PlayerState,
): GameActionDTO[] {
    return gameState.phase === GamePhase.ROUND_ACTIVE &&
        isDefenseSeat(actor.seat, gameState.roundRoleState)
        ? [{ actionType: GameActionType.GIVE_UP_DEFENSE }]
        : [];
}

/**
 * 创建玩家当前可执行的确认收牌动作。
 */
function createCollectTableActions(
    gameState: GameState,
    actor: PlayerState,
): GameActionDTO[] {
    return gameState.phase === GamePhase.DEFENSE_COLLECTING &&
        isDefenseSeat(actor.seat, gameState.roundRoleState) &&
        allAttackStopped(gameState)
        ? [{ actionType: GameActionType.COLLECT_TABLE_CARDS }]
        : [];
}

/**
 * 判断一次守牌移动或换位后是否仍满足全部防守关系。
 */
function canMoveDefenseCard(
    tablePairs: TablePairState[],
    trumpSuit: GameState["trumpSuit"],
    sourcePair: TablePairState,
    targetPair: TablePairState,
): boolean {
    /** 测试用副本用于验证移动后的防守合法性，不修改原桌面状态。 */
    const nextPairs = tablePairs.map((pair) => ({ ...pair }));
    const nextSource = nextPairs.find(
        (pair) => pair.pairId === sourcePair.pairId,
    );
    const nextTarget = nextPairs.find(
        (pair) => pair.pairId === targetPair.pairId,
    );
    if (nextSource?.defendCard === undefined || nextTarget === undefined) {
        return false;
    }
    const sourceCard = nextSource.defendCard;
    const targetCard = nextTarget.defendCard;
    if (targetCard === undefined) {
        delete nextSource.defendCard;
    } else {
        nextSource.defendCard = targetCard;
    }
    nextTarget.defendCard = sourceCard;
    return areDefensesValid(nextPairs, trumpSuit);
}

/**
 * 查找玩家手中最小的可换底主牌。
 */
function findExchangeCard(
    handCards: CardDTO[],
    trumpCard: CardDTO,
): CardDTO | undefined {
    return handCards
        .filter(
            (card) =>
                !card.isSealCard &&
                card.suit === trumpCard.suit &&
                getRankWeight(card.rank) < getRankWeight(trumpCard.rank),
        )
        .sort(
            (left, right) =>
                getRankWeight(left.rank) - getRankWeight(right.rank),
        )[0];
}

/**
 * 判断指定进攻座位是否已经声明停止进攻。
 */
function isAttackStopped(gameState: GameState, seat: number): boolean {
    return gameState.roundBattleState.stoppedAttackSeats.includes(seat);
}

/**
 * 判断当前轮所有攻击方是否都已经停止进攻。
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
