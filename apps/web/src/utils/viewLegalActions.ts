/**
 * 玩家视角合法动作工具，只用于前端按钮启用和基础交互提示。
 */
import {
    CardRank,
    GameActionType,
    GamePhase,
    PlayerRole,
    PlayerStatus,
} from "@gonghua/contracts";
import type {
    CardDTO,
    GameActionDTO,
    GameViewStateDTO,
    PlayerViewDTO,
} from "@gonghua/contracts";

/** 前端视角使用的点数权重，保持和规则层大小顺序一致。 */
const rankWeight: Record<CardRank, number> = {
    [CardRank.TWO]: 1,
    [CardRank.THREE]: 2,
    [CardRank.FOUR]: 3,
    [CardRank.FIVE]: 4,
    [CardRank.SIX]: 5,
    [CardRank.SEVEN]: 6,
    [CardRank.EIGHT]: 7,
    [CardRank.NINE]: 8,
    [CardRank.TEN]: 9,
    [CardRank.JACK]: 10,
    [CardRank.QUEEN]: 11,
    [CardRank.KING]: 12,
    [CardRank.ACE]: 13,
    [CardRank.SMALL_JOKER]: 14,
    [CardRank.BIG_JOKER]: 15,
};

/**
 * 根据玩家视角状态和当前选择，生成前端可以直接提交的动作。
 */
export function getViewLegalActions(input: {
    viewState: GameViewStateDTO;
    selectedCardId: string;
    selectedCardIds?: string[];
    selectedPairId: string;
    sourcePairId?: string;
    targetPairId?: string;
}): GameActionDTO[] {
    const {
        viewState,
        selectedCardId,
        selectedCardIds,
        selectedPairId,
        sourcePairId,
        targetPairId,
    } = input;
    /** 当前玩家视角只包含自己和机器人手牌，按钮只针对当前真人玩家。 */
    const currentPlayer = viewState.players.find(
        (player) => player.isCurrentPlayer,
    );
    if (
        currentPlayer === undefined ||
        currentPlayer.status !== PlayerStatus.ACTIVE ||
        viewState.phase === GamePhase.GAME_OVER
    ) {
        return [];
    }

    const actions: GameActionDTO[] = [];
    if (
        viewState.deckCount > 0 &&
        hasTrumpExchange(currentPlayer.handCards, viewState.trumpCard)
    ) {
        actions.push({ actionType: GameActionType.EXCHANGE_TRUMP_CARD });
    }
    if (
        viewState.phase === GamePhase.ROUND_RESULT_READY ||
        viewState.phase === GamePhase.WAITING_DEFENSE_REFILL
    ) {
        return actions;
    }
    if (selectedCardId.length > 0) {
        actions.push(
            ...createSelectedCardActions(
                viewState,
                currentPlayer,
                selectedCardId,
                selectedCardIds ?? [selectedCardId],
                selectedPairId,
            ),
        );
    }
    actions.push(
        ...createNoCardActions(viewState, currentPlayer, selectedPairId),
    );
    actions.push(
        ...createMoveDefenseActions(
            viewState,
            currentPlayer,
            sourcePairId,
            targetPairId,
        ),
    );
    return actions;
}

/**
 * 根据当前选中的手牌生成出牌类动作。
 */
function createSelectedCardActions(
    viewState: GameViewStateDTO,
    currentPlayer: PlayerViewDTO,
    selectedCardId: string,
    selectedCardIds: string[],
    selectedPairId: string,
): GameActionDTO[] {
    if (
        currentPlayer.canAct &&
        currentPlayer.role !== PlayerRole.DEFENSE &&
        viewState.phase !== GamePhase.TRUMP_EXCHANGE_READY &&
        !isAttackStopped(viewState, currentPlayer.seat)
    ) {
        if (selectedCardIds.length > 1) {
            return [
                {
                    actionType: GameActionType.PLAY_ATTACK_CARDS,
                    cardIds: selectedCardIds,
                },
            ];
        }
        return [
            {
                actionType: GameActionType.PLAY_ATTACK_CARD,
                cardId: selectedCardId,
            },
        ];
    }
    if (
        !currentPlayer.canAct ||
        currentPlayer.role !== PlayerRole.DEFENSE ||
        viewState.phase !== GamePhase.ROUND_ACTIVE ||
        selectedCardIds.length !== 1 ||
        selectedPairId.length === 0
    ) {
        return [];
    }
    return [
        {
            actionType: GameActionType.PLAY_DEFENSE_CARD,
            cardId: selectedCardId,
            targetPairId: selectedPairId,
        },
    ];
}

/**
 * 生成不依赖当前手牌选择的流程动作。
 */
function createNoCardActions(
    viewState: GameViewStateDTO,
    currentPlayer: PlayerViewDTO,
    selectedPairId: string,
): GameActionDTO[] {
    const actions: GameActionDTO[] = [];
    const isAttackRole = currentPlayer.role !== PlayerRole.DEFENSE;
    if (
        currentPlayer.canAct &&
        isAttackRole &&
        (viewState.phase === GamePhase.ROUND_ACTIVE ||
            viewState.phase === GamePhase.DEFENSE_COLLECTING) &&
        !isAttackStopped(viewState, currentPlayer.seat)
    ) {
        actions.push({ actionType: GameActionType.STOP_ATTACK });
    }
    if (
        currentPlayer.canAct &&
        currentPlayer.role === PlayerRole.DEFENSE &&
        viewState.phase === GamePhase.ROUND_ACTIVE
    ) {
        actions.push({ actionType: GameActionType.GIVE_UP_DEFENSE });
        if (selectedPairId.length > 0) {
            actions.push({
                actionType: GameActionType.RECALL_DEFENSE_CARD,
                sourcePairId: selectedPairId,
            });
        }
    }
    if (
        currentPlayer.canAct &&
        currentPlayer.role === PlayerRole.DEFENSE &&
        viewState.phase === GamePhase.DEFENSE_COLLECTING &&
        allAttackersStopped(viewState)
    ) {
        actions.push({ actionType: GameActionType.COLLECT_TABLE_CARDS });
    }
    return actions;
}

/**
 * 根据拖拽来源和目标生成守牌移动动作。
 */
function createMoveDefenseActions(
    viewState: GameViewStateDTO,
    currentPlayer: PlayerViewDTO,
    sourcePairId?: string,
    targetPairId?: string,
): GameActionDTO[] {
    if (
        !currentPlayer.canAct ||
        currentPlayer.role !== PlayerRole.DEFENSE ||
        viewState.phase !== GamePhase.ROUND_ACTIVE ||
        sourcePairId === undefined ||
        targetPairId === undefined ||
        sourcePairId === targetPairId
    ) {
        return [];
    }
    return [
        {
            actionType: GameActionType.MOVE_DEFENSE_CARD,
            sourcePairId,
            targetPairId,
        },
    ];
}

/**
 * 判断指定攻击方是否已经停止进攻。
 */
function isAttackStopped(viewState: GameViewStateDTO, seat: number): boolean {
    return viewState.roundBattleState.stoppedAttackSeats.includes(seat);
}

/**
 * 判断当前玩家是否存在可换底主牌。
 */
function hasTrumpExchange(handCards: CardDTO[], trumpCard: CardDTO): boolean {
    return handCards.some(
        (card) =>
            !card.isSealCard &&
            card.suit === trumpCard.suit &&
            rankWeight[card.rank] < rankWeight[trumpCard.rank],
    );
}

/**
 * 判断当前轮所有攻击角色是否都已经停止进攻。
 */
function allAttackersStopped(viewState: GameViewStateDTO): boolean {
    return [
        viewState.roundRoleState.attackSeat,
        ...viewState.roundRoleState.supportSeats,
    ].every((seat) => {
        const player = viewState.players.find((item) => item.seat === seat);
        return (
            player?.status === PlayerStatus.FINISHED ||
            viewState.roundBattleState.stoppedAttackSeats.includes(seat)
        );
    });
}

/**
 * 从合法动作列表中查找指定类型的无参数动作。
 */
export function findSimpleViewAction(
    actions: GameActionDTO[],
    actionType:
        | GameActionType.EXCHANGE_TRUMP_CARD
        | GameActionType.STOP_ATTACK
        | GameActionType.GIVE_UP_DEFENSE
        | GameActionType.COLLECT_TABLE_CARDS,
): GameActionDTO | undefined {
    return actions.find((action) => action.actionType === actionType);
}

/**
 * 从合法动作列表中查找选中手牌对应的攻牌动作。
 */
export function findSelectedAttackAction(
    actions: GameActionDTO[],
): GameActionDTO | undefined {
    return actions.find(
        (action) =>
            action.actionType === GameActionType.PLAY_ATTACK_CARD ||
            action.actionType === GameActionType.PLAY_ATTACK_CARDS,
    );
}

/**
 * 从合法动作列表中查找选中手牌和牌位对应的守牌动作。
 */
export function findSelectedDefenseAction(
    actions: GameActionDTO[],
): GameActionDTO | undefined {
    return actions.find(
        (action) => action.actionType === GameActionType.PLAY_DEFENSE_CARD,
    );
}

/**
 * 从合法动作列表中查找选中牌位对应的撤回守牌动作。
 */
export function findSelectedRecallAction(
    actions: GameActionDTO[],
): GameActionDTO | undefined {
    return actions.find(
        (action) => action.actionType === GameActionType.RECALL_DEFENSE_CARD,
    );
}

/**
 * 从合法动作列表中查找拖拽守牌移动动作。
 */
export function findSelectedMoveDefenseAction(
    actions: GameActionDTO[],
): GameActionDTO | undefined {
    return actions.find(
        (action) => action.actionType === GameActionType.MOVE_DEFENSE_CARD,
    );
}
