/**
 * 游戏核心状态机测试，优先覆盖不依赖前端和服务端的规则闭环。
 */
import { describe, expect, it } from "vitest";
import {
    CardDTO,
    CardRank,
    CardSuit,
    GameActionType,
    GameErrorCode,
    GameEventType,
    GameMode,
    GamePhase,
    PlayerStatus,
    PlayerType,
    RoundResult,
} from "@gonghua/contracts";
import { createStandardDeck, markTrumpCards } from "../src/deck";
import {
    applyBotActionStep,
    applyGameAction,
    createGame,
    hasPendingBotAction,
    checkCardConservation,
} from "../src/engine";
import { getLegalActions } from "../src/legalActions";
import type { GameState, TablePairState } from "../src/model";
import { canDefendCard, getRankWeight } from "../src/rules";
import { createPlayerView } from "../src/view";

/**
 * 创建固定种子的合法对局，保证测试用例稳定复现。
 */
function requireGame(seed = 20260623) {
    /** 固定玩家视角创建的对局结果。 */
    const result = createGame({
        seed,
        currentPlayerId: "player-1",
        enableBots: false,
    });
    expect(result.success).toBe(true);
    expect(result.gameState).toBeDefined();
    return resolveTrumpExchange(result.gameState!);
}

/**
 * 自动执行所有可换底动作，让普通攻防测试从首攻准备态开始。
 */
function resolveTrumpExchange(gameState: GameState): GameState {
    let nextState = gameState;
    while (nextState.phase === GamePhase.TRUMP_EXCHANGE_READY) {
        const trumpCard = nextState.trumpCard;
        const actor = nextState.players.find((player) =>
            player.handCards.some(
                (card) =>
                    !card.isSealCard &&
                    card.suit === trumpCard.suit &&
                    getRankWeight(card.rank) < getRankWeight(trumpCard.rank),
            ),
        );
        if (actor === undefined) {
            return nextState;
        }
        const result = applyGameAction(nextState, actor.playerId, {
            actionType: GameActionType.EXCHANGE_TRUMP_CARD,
        });
        expect(result.success).toBe(true);
        nextState = result.gameState!;
    }
    return nextState;
}

/**
 * 创建一个首攻后攻击方仍有同点可追加牌的稳定测试状态。
 */
function collectingScenario() {
    for (let seed = 20260623; seed < 20260623 + 500; seed += 1) {
        /** 候选对局用于搜索可稳定触发加攻的发牌结果。 */
        const game = requireGame(seed);
        /** 当前轮主攻方先建立桌面攻牌点数。 */
        const attacker = game.players.find(
            (player) => player.seat === game.roundRoleState.attackSeat,
        )!;
        for (const firstCard of attacker.handCards) {
            /** 首攻结果作为放弃防守和加攻的基础状态。 */
            const attacked = applyGameAction(game, attacker.playerId, {
                actionType: GameActionType.PLAY_ATTACK_CARD,
                cardId: firstCard.id,
            }).gameState!;
            /** 受攻方主动放弃后应进入收牌追加阶段。 */
            const defender = attacked.players.find(
                (player) => player.seat === attacked.roundRoleState.defendSeat,
            )!;
            const collecting = applyGameAction(attacked, defender.playerId, {
                actionType: GameActionType.GIVE_UP_DEFENSE,
            }).gameState!;
            /** 任一攻击角色只要有同点牌，就可用于验证收牌阶段继续加攻。 */
            const nextAttacker = collecting.players.find(
                (player) =>
                    player.seat !== collecting.roundRoleState.defendSeat &&
                    player.handCards.some(
                        (card) => card.rank === firstCard.rank,
                    ),
            );
            const addCard = nextAttacker?.handCards.find(
                (card) => card.rank === firstCard.rank,
            );
            if (nextAttacker !== undefined && addCard !== undefined) {
                return { collecting, defender, nextAttacker, addCard };
            }
        }
    }
    throw new Error("未找到可验证收牌阶段加攻的固定发牌场景");
}

/**
 * 让当前轮所有攻击角色依次声明停止进攻，并返回最后状态。
 */
function stopAllAttackRoles(gameState: GameState): GameState {
    /** 主攻方先停攻，随后所有助攻方按座位列表停攻。 */
    const attackRoleSeats = [
        gameState.roundRoleState.attackSeat,
        ...gameState.roundRoleState.supportSeats,
    ];
    return attackRoleSeats.reduce((nextState, seat) => {
        const player = nextState.players.find((item) => item.seat === seat)!;
        const result = applyGameAction(nextState, player.playerId, {
            actionType: GameActionType.STOP_ATTACK,
        });
        expect(result.success).toBe(true);
        return result.gameState!;
    }, gameState);
}

/**
 * 按标识从牌堆中取出测试卡牌，找不到时直接暴露测试数据错误。
 */
function requireCard(cards: CardDTO[], cardId: string): CardDTO {
    /** 测试构造依赖固定标准牌标识。 */
    const card = cards.find((item) => item.id === cardId);
    if (card === undefined) {
        throw new Error(`测试牌不存在：${cardId}`);
    }
    return card;
}

/**
 * 创建可精确控制桌面牌和玩家手牌的完整 54 张测试状态。
 */
function createManualRoundState(input: {
    tablePairs: TablePairState[];
    defenderHandCards?: CardDTO[];
    attackerHandCards?: CardDTO[];
    supportHandCards?: CardDTO[];
    supportTwoHandCards?: CardDTO[];
    deckCards?: CardDTO[];
}): GameState {
    /** 测试统一使用梅花为主花色，避免普通同花比较被主牌规则干扰。 */
    const allCards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
    /** 已经放入玩家手牌或桌面的卡牌标识，用于生成剩余牌堆。 */
    const usedCardIds = new Set<string>();
    const collectUsedCard = (card: CardDTO) => usedCardIds.add(card.id);
    for (const card of input.attackerHandCards ?? []) {
        collectUsedCard(card);
    }
    for (const card of input.defenderHandCards ?? []) {
        collectUsedCard(card);
    }
    for (const card of input.supportHandCards ?? []) {
        collectUsedCard(card);
    }
    for (const card of input.supportTwoHandCards ?? []) {
        collectUsedCard(card);
    }
    for (const card of input.deckCards ?? []) {
        collectUsedCard(card);
    }
    for (const pair of input.tablePairs) {
        collectUsedCard(pair.attackCard);
        if (pair.defendCard !== undefined) {
            collectUsedCard(pair.defendCard);
        }
    }

    /** 未明确指定牌堆时，剩余卡牌全部放入牌堆，保证状态机动作后的守恒校验可通过。 */
    const deck =
        input.deckCards ?? allCards.filter((card) => !usedCardIds.has(card.id));
    /** 明确指定短牌堆时，其余未使用卡牌放入弃牌区维持牌数守恒。 */
    const discardPile =
        input.deckCards === undefined
            ? []
            : allCards.filter((card) => !usedCardIds.has(card.id));
    const trumpCard = deck[deck.length - 1] ?? allCards[0]!;
    return {
        gameId: "manual-test-game",
        stateVersion: 0,
        phase: GamePhase.ROUND_ACTIVE,
        players: [
            {
                playerId: "attacker",
                seat: 0,
                name: "主攻",
                isBot: false,
                status: PlayerStatus.ACTIVE,
                handCards: input.attackerHandCards ?? [],
            },
            {
                playerId: "defender",
                seat: 1,
                name: "受攻",
                isBot: false,
                status: PlayerStatus.ACTIVE,
                handCards: input.defenderHandCards ?? [],
            },
            {
                playerId: "support",
                seat: 2,
                name: "助攻",
                isBot: false,
                status: PlayerStatus.ACTIVE,
                handCards: input.supportHandCards ?? [],
            },
            {
                playerId: "support-2",
                seat: 3,
                name: "助攻2",
                isBot: false,
                status: PlayerStatus.ACTIVE,
                handCards: input.supportTwoHandCards ?? [],
            },
        ],
        deck,
        trumpCard,
        trumpSuit: CardSuit.CLUB,
        isNoRefillMode: false,
        tablePairs: input.tablePairs,
        discardPile,
        config: {
            mode: GameMode.NORMAL,
            playerCount: 4,
            initialHandSize: 8,
            seed: 1,
        },
        roundRoleState: {
            attackSeat: 0,
            defendSeat: 1,
            supportSeats: [2, 3],
            currentTurnSeat: 1,
        },
        roundBattleState: {
            isAttackSealed: false,
            stoppedAttackSeats: [],
            roundResult: RoundResult.NONE,
        },
    };
}

/**
 * 创建可精确控制主牌换底阶段的测试状态。
 */
function createExchangeState(input: {
    trumpCard: CardDTO;
    attackerHandCards?: CardDTO[];
    defenderHandCards?: CardDTO[];
    supportHandCards?: CardDTO[];
}): GameState {
    /** 换底测试统一使用完整牌堆和弃牌区补足 54 张牌。 */
    const allCards = markTrumpCards(createStandardDeck(), input.trumpCard.suit);
    const usedCardIds = new Set<string>([input.trumpCard.id]);
    for (const card of input.attackerHandCards ?? []) {
        usedCardIds.add(card.id);
    }
    for (const card of input.defenderHandCards ?? []) {
        usedCardIds.add(card.id);
    }
    for (const card of input.supportHandCards ?? []) {
        usedCardIds.add(card.id);
    }
    return {
        gameId: "manual-exchange-game",
        stateVersion: 0,
        phase: GamePhase.TRUMP_EXCHANGE_READY,
        players: [
            {
                playerId: "attacker",
                seat: 0,
                name: "主攻",
                isBot: false,
                status: PlayerStatus.ACTIVE,
                handCards: input.attackerHandCards ?? [],
            },
            {
                playerId: "defender",
                seat: 1,
                name: "受攻",
                isBot: false,
                status: PlayerStatus.ACTIVE,
                handCards: input.defenderHandCards ?? [],
            },
            {
                playerId: "support",
                seat: 2,
                name: "助攻",
                isBot: false,
                status: PlayerStatus.ACTIVE,
                handCards: input.supportHandCards ?? [],
            },
            {
                playerId: "support-2",
                seat: 3,
                name: "助攻2",
                isBot: false,
                status: PlayerStatus.ACTIVE,
                handCards: [],
            },
        ],
        deck: [input.trumpCard],
        trumpCard: input.trumpCard,
        trumpSuit: input.trumpCard.suit,
        isNoRefillMode: false,
        tablePairs: [],
        discardPile: allCards.filter((card) => !usedCardIds.has(card.id)),
        config: {
            mode: GameMode.NORMAL,
            playerCount: 4,
            initialHandSize: 8,
            seed: 1,
        },
        roundRoleState: {
            attackSeat: 0,
            defendSeat: 1,
            supportSeats: [2, 3],
            currentTurnSeat: 0,
        },
        roundBattleState: {
            isAttackSealed: false,
            stoppedAttackSeats: [],
            roundResult: RoundResult.NONE,
        },
    };
}

describe("game-core", () => {
    it("rejects seven players in the current single-deck setup", () => {
        const result = createGame({
            playerCount: 7,
            currentPlayerId: "player-1",
            enableBots: false,
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(GameErrorCode.INVALID_ACTION_ARGUMENT);
        expect(result.errorMessage).toBe("当前单副牌玩法支持 2 到 6 名玩家");
    });

    it("creates a conserved 54-card game and keeps trump card inside deck", () => {
        /** 初始对局用于验证发牌和翻主牌后的牌数归属。 */
        const game = requireGame();
        /** 牌数守恒结果必须覆盖手牌、牌堆、桌面和弃牌区。 */
        const conservation = checkCardConservation(game);
        expect(conservation.success).toBe(true);
        expect(conservation.totalCards).toBe(54);
        expect(game.trumpCard.isSealCard).toBe(false);
        expect(game.deck.some((card) => card.id === game.trumpCard.id)).toBe(
            true,
        );
        expect(game.phase).toBe(GamePhase.FIRST_ATTACK_READY);
    });

    it("exchanges the smallest lower trump card with deck bottom card", () => {
        /** 构造底牌为主 7，玩家手中有主 5 和主 3，应使用最小主 3 换底。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const trumpCard = requireCard(cards, "club-7");
        const game = createExchangeState({
            trumpCard,
            attackerHandCards: [
                requireCard(cards, "club-5"),
                requireCard(cards, "club-3"),
            ],
        });

        /** 换底后主 3 进入牌堆底部，原底牌进入玩家手牌。 */
        const result = applyGameAction(game, "attacker", {
            actionType: GameActionType.EXCHANGE_TRUMP_CARD,
        });
        const actor = result.gameState?.players.find(
            (player) => player.playerId === "attacker",
        );
        expect(result.success).toBe(true);
        expect(result.gameState?.trumpCard.id).toBe("club-3");
        expect(result.gameState?.deck.at(-1)?.id).toBe("club-3");
        expect(actor?.handCards.some((card) => card.id === "club-7")).toBe(
            true,
        );
        expect(actor?.handCards.some((card) => card.id === "club-3")).toBe(
            false,
        );
        expect(checkCardConservation(result.gameState!).success).toBe(true);
    });

    it("keeps current normal phase when another player still has lower trump card", () => {
        /** 构造连续换底场景，第一名玩家换底后，第二名玩家仍可继续换但不阻塞首攻。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createExchangeState({
            trumpCard: requireCard(cards, "club-7"),
            attackerHandCards: [requireCard(cards, "club-5")],
            defenderHandCards: [requireCard(cards, "club-3")],
        });
        game.phase = GamePhase.FIRST_ATTACK_READY;

        /** 第一轮换底后底牌变为主 5，但阶段仍保持首攻准备，不等待换底。 */
        const result = applyGameAction(game, "attacker", {
            actionType: GameActionType.EXCHANGE_TRUMP_CARD,
        });
        expect(result.success).toBe(true);
        expect(result.gameState?.phase).toBe(GamePhase.FIRST_ATTACK_READY);
        expect(result.gameState?.trumpCard.id).toBe("club-5");
    });

    it("does not reset attack roles after trump exchange", () => {
        /** 构造换底后底牌变小的场景，验证换底只影响底牌和手牌，不重新指定首攻。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createExchangeState({
            trumpCard: requireCard(cards, "club-7"),
            attackerHandCards: [requireCard(cards, "club-5")],
            supportHandCards: [requireCard(cards, "club-3")],
        });
        game.phase = GamePhase.FIRST_ATTACK_READY;
        const roleStateBeforeExchange = { ...game.roundRoleState };

        /** 换底成功后，首攻方、受攻方、助攻方和当前行动方都必须保持不变。 */
        const result = applyGameAction(game, "attacker", {
            actionType: GameActionType.EXCHANGE_TRUMP_CARD,
        });

        expect(result.success).toBe(true);
        expect(result.gameState?.roundRoleState).toEqual(
            roleStateBeforeExchange,
        );
        expect(
            result.events.some(
                (event) => event.type === GameEventType.FIRST_ATTACK_READY,
            ),
        ).toBe(false);
    });

    it("rejects trump exchange from a player without lower trump card", () => {
        /** 构造玩家没有低于底牌的主牌时尝试换底的非法场景。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createExchangeState({
            trumpCard: requireCard(cards, "club-7"),
            attackerHandCards: [requireCard(cards, "club-K")],
        });

        /** 没有更小主牌的玩家不能执行换底。 */
        const result = applyGameAction(game, "attacker", {
            actionType: GameActionType.EXCHANGE_TRUMP_CARD,
        });
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(GameErrorCode.CARD_NOT_IN_HAND);
    });

    it("rejects attack from a non attack role before first attack", () => {
        /** 初始对局仍处于首攻准备阶段。 */
        const game = requireGame();
        /** 受攻方不能在首攻前主动打出攻牌。 */
        const defender = game.players.find(
            (player) => player.seat === game.roundRoleState.defendSeat,
        )!;
        /** 受攻方手中的任意牌都不应被允许作为首张攻牌。 */
        const card = defender.handCards[0]!;
        /** 非法动作结果应返回角色不允许错误。 */
        const result = applyGameAction(game, defender.playerId, {
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: card.id,
        });
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(GameErrorCode.ROLE_NOT_ALLOWED);
    });

    it("plays first attack and moves round to defense", () => {
        /** 初始对局用于验证首攻动作能进入攻防阶段。 */
        const game = requireGame();
        /** 当前轮主攻方是唯一允许打出首张攻牌的玩家。 */
        const attacker = game.players.find(
            (player) => player.seat === game.roundRoleState.attackSeat,
        )!;
        /** 主攻方选择一张手牌作为首张攻牌。 */
        const card = attacker.handCards[0]!;
        /** 首攻动作应创建桌面牌位并保持牌数守恒。 */
        const result = applyGameAction(game, attacker.playerId, {
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: card.id,
        });
        expect(result.success).toBe(true);
        expect(result.gameState?.phase).toBe(GamePhase.ROUND_ACTIVE);
        expect(result.gameState?.tablePairs).toHaveLength(1);
        expect(checkCardConservation(result.gameState!).success).toBe(true);
    });

    it("plays multiple first attack cards in one atomic action", () => {
        /** 构造首攻方手中有多张牌的状态，用于验证批量首攻会一次性进入桌面。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [
                requireCard(cards, "diamond-7"),
                requireCard(cards, "spade-9"),
                requireCard(cards, "heart-5"),
            ],
            tablePairs: [],
        });
        game.phase = GamePhase.FIRST_ATTACK_READY;
        game.roundRoleState.currentTurnSeat = game.roundRoleState.attackSeat;

        /** 一次性打出多张牌时，中间不会产生可被防守方抢先介入的状态。 */
        const result = applyGameAction(game, "attacker", {
            actionType: GameActionType.PLAY_ATTACK_CARDS,
            cardIds: ["diamond-7", "spade-9"],
        });
        const attacker = result.gameState?.players.find(
            (player) => player.playerId === "attacker",
        );
        expect(result.success).toBe(true);
        expect(result.gameState?.phase).toBe(GamePhase.ROUND_ACTIVE);
        expect(result.gameState?.tablePairs).toHaveLength(2);
        expect(attacker?.handCards.map((card) => card.id)).toEqual(["heart-5"]);
        expect(checkCardConservation(result.gameState!).success).toBe(true);
    });

    it("rejects invalid multiple attack cards without changing original state", () => {
        /** 构造追加攻牌时第二张无法命中桌面点数的非法批量动作。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [
                requireCard(cards, "diamond-7"),
                requireCard(cards, "spade-9"),
            ],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "heart-7"),
                },
            ],
        });

        /** 批量动作必须原子失败，不能先移除第一张合法牌再报错。 */
        const result = applyGameAction(game, "attacker", {
            actionType: GameActionType.PLAY_ATTACK_CARDS,
            cardIds: ["diamond-7", "spade-9"],
        });
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(GameErrorCode.ATTACK_RANK_NOT_MATCHED);
        expect(game.tablePairs).toHaveLength(1);
        expect(game.players[0]?.handCards.map((card) => card.id)).toEqual([
            "diamond-7",
            "spade-9",
        ]);
    });

    it("lists legal first attack actions for current main attacker", () => {
        /** 初始首攻状态用于验证合法动作枚举不会放开非首攻玩家。 */
        const game = requireGame();
        const attacker = game.players.find(
            (player) => player.seat === game.roundRoleState.attackSeat,
        )!;
        const defender = game.players.find(
            (player) => player.seat === game.roundRoleState.defendSeat,
        )!;

        /** 主攻方的每张手牌都应能作为首张攻牌提交。 */
        const legalAttackActions = getLegalActions(
            game,
            attacker.playerId,
        ).filter(
            (action) => action.actionType === GameActionType.PLAY_ATTACK_CARD,
        );
        expect(legalAttackActions).toHaveLength(attacker.handCards.length);
        expect(
            applyGameAction(game, attacker.playerId, legalAttackActions[0]!)
                .success,
        ).toBe(true);

        /** 受攻方在首攻前不能被枚举出攻牌动作。 */
        const defenderAttackActions = getLegalActions(
            game,
            defender.playerId,
        ).filter(
            (action) => action.actionType === GameActionType.PLAY_ATTACK_CARD,
        );
        expect(defenderAttackActions).toHaveLength(0);
    });

    it("allows a valid defense card to cover an attack card", () => {
        /** 初始对局用于验证受攻方合法防守流程。 */
        const game = requireGame();
        /** 主攻方先打出一张非大小王牌，便于寻找普通防守牌。 */
        const attacker = game.players.find(
            (player) => player.seat === game.roundRoleState.attackSeat,
        )!;
        /** 本用例优先选择普通攻牌，避免大小王边界影响基础防守判断。 */
        const attackCard = attacker.handCards.find((card) => !card.isSealCard)!;
        /** 首攻后的状态包含一个等待防守的桌面牌位。 */
        const attacked = applyGameAction(game, attacker.playerId, {
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: attackCard.id,
        }).gameState!;
        /** 当前受攻方负责覆盖桌面攻牌。 */
        const defender = attacked.players.find(
            (player) => player.seat === attacked.roundRoleState.defendSeat,
        )!;
        /** 从受攻方手牌中寻找一张能合法压制攻牌的守牌。 */
        const defenseCard = defender.handCards.find((card) =>
            canDefendCard(attackCard, card, attacked.trumpSuit),
        );
        if (defenseCard === undefined) {
            return;
        }
        /** 守牌成功后仍允许攻击方继续根据桌面牌追加进攻。 */
        const result = applyGameAction(attacked, defender.playerId, {
            actionType: GameActionType.PLAY_DEFENSE_CARD,
            cardId: defenseCard.id,
            targetPairId: attacked.tablePairs[0]!.pairId,
        });
        expect(result.success).toBe(true);
        expect(result.gameState?.phase).toBe(GamePhase.ROUND_ACTIVE);
        expect(result.gameState?.roundBattleState.roundResult).toBe(
            RoundResult.NONE,
        );
    });

    it("lists legal defense actions that pass real engine validation", () => {
        /** 构造单攻牌和单张可防守手牌，验证枚举结果与真实提交入口一致。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                },
            ],
            defenderHandCards: [
                requireCard(cards, "diamond-8"),
                requireCard(cards, "spade-8"),
            ],
        });

        /** 只有同花色且更大的方块 8 可以防守方块 7。 */
        const legalDefenseActions = getLegalActions(game, "defender").filter(
            (action) => action.actionType === GameActionType.PLAY_DEFENSE_CARD,
        );
        expect(legalDefenseActions).toEqual([
            {
                actionType: GameActionType.PLAY_DEFENSE_CARD,
                cardId: "diamond-8",
                targetPairId: "pair-1",
            },
        ]);
        expect(
            applyGameAction(game, "defender", legalDefenseActions[0]!).success,
        ).toBe(true);
    });

    it("lists only legal defense move actions", () => {
        /** 构造一个可移动守牌和一个不可移动目标，用于验证非法换位不会被枚举。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                    defendCard: requireCard(cards, "diamond-K"),
                },
                {
                    pairId: "pair-2",
                    attackCard: requireCard(cards, "diamond-Q"),
                },
                {
                    pairId: "pair-3",
                    attackCard: requireCard(cards, "spade-Q"),
                },
            ],
        });

        /** 方块 K 可以移动到方块 Q，但不能移动到黑桃 Q。 */
        const legalMoveActions = getLegalActions(game, "defender").filter(
            (action) => action.actionType === GameActionType.MOVE_DEFENSE_CARD,
        );
        expect(legalMoveActions).toEqual([
            {
                actionType: GameActionType.MOVE_DEFENSE_CARD,
                sourcePairId: "pair-1",
                targetPairId: "pair-2",
            },
        ]);
        expect(
            applyGameAction(game, "defender", legalMoveActions[0]!).success,
        ).toBe(true);
    });

    it("treats ace as higher than king in normal rank comparison", () => {
        /** 构造同花色 A 和 K，用于验证普通牌大小顺序。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const kingCard = requireCard(cards, "diamond-K");
        const aceCard = requireCard(cards, "diamond-A");
        expect(canDefendCard(kingCard, aceCard, CardSuit.CLUB)).toBe(true);
        expect(canDefendCard(aceCard, kingCard, CardSuit.CLUB)).toBe(false);
    });

    it("rejects unmatched add attack card", () => {
        /** 初始对局用于验证同点加攻限制。 */
        const game = requireGame();
        /** 主攻方先打出一张攻牌建立桌面点数条件。 */
        const attacker = game.players.find(
            (player) => player.seat === game.roundRoleState.attackSeat,
        )!;
        /** 首张攻牌决定当前桌面已有点数。 */
        const firstCard = attacker.handCards[0]!;
        /** 首攻后的状态允许助攻方尝试追加攻牌。 */
        const attacked = applyGameAction(game, attacker.playerId, {
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: firstCard.id,
        }).gameState!;
        /** 助攻方具备追加攻牌角色，但仍必须满足点数规则。 */
        const support = attacked.players.find((player) =>
            attacked.roundRoleState.supportSeats.includes(player.seat),
        )!;
        /** 选择一张未命中桌面点数且不是大小王的牌作为非法追加牌。 */
        const unmatched = support.handCards.find(
            (card) =>
                card.rank !== firstCard.rank &&
                card.rank !== CardRank.SMALL_JOKER &&
                card.rank !== CardRank.BIG_JOKER,
        );
        if (unmatched === undefined) {
            return;
        }
        /** 未命中点数的追加攻牌必须被规则拒绝。 */
        const result = applyGameAction(attacked, support.playerId, {
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: unmatched.id,
        });
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(GameErrorCode.ATTACK_RANK_NOT_MATCHED);
    });

    it("allows attack roles to add cards after defender gives up", () => {
        /** 构造受攻方已放弃但攻击方仍有可攻牌的状态。 */
        const { collecting, nextAttacker, addCard } = collectingScenario();
        /** 收牌追加阶段应允许攻击角色继续把合法攻牌放到桌面。 */
        const result = applyGameAction(collecting, nextAttacker.playerId, {
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: addCard.id,
        });
        expect(result.success).toBe(true);
        expect(result.gameState?.phase).toBe(GamePhase.DEFENSE_COLLECTING);
        expect(result.gameState?.roundBattleState.roundResult).toBe(
            RoundResult.DEFENSE_FAILED,
        );
        expect(result.gameState?.tablePairs).toHaveLength(
            collecting.tablePairs.length + 1,
        );
    });

    it("rejects collecting table cards before every attacker stops", () => {
        /** 构造已放弃防守但攻击方尚未全部停攻的收牌阶段。 */
        const { collecting, defender } = collectingScenario();
        /** 攻击方未全部停攻前，受攻方不能直接确认收牌。 */
        const result = applyGameAction(collecting, defender.playerId, {
            actionType: GameActionType.COLLECT_TABLE_CARDS,
        });
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(GameErrorCode.INVALID_ACTION_ARGUMENT);
    });

    it("collects table cards and starts next round after defense failed", () => {
        /** 构造收牌追加阶段，并记录收牌前桌面牌数量和受攻方手牌数。 */
        const { collecting, defender } = collectingScenario();
        const stopped = stopAllAttackRoles(collecting);
        const tableCardCount = collecting.tablePairs.reduce(
            (sum, pair) => sum + 1 + (pair.defendCard === undefined ? 0 : 1),
            0,
        );
        const defenderHandCount = defender.handCards.length;
        /** 受攻方确认收牌后，系统自动完成收牌、补牌和下轮轮转。 */
        const result = applyGameAction(stopped, defender.playerId, {
            actionType: GameActionType.COLLECT_TABLE_CARDS,
        });
        const nextDefender = result.gameState?.players.find(
            (player) => player.seat === collecting.roundRoleState.defendSeat,
        );
        expect(result.success).toBe(true);
        expect(result.gameState?.phase).toBe(GamePhase.FIRST_ATTACK_READY);
        expect(result.gameState?.tablePairs).toHaveLength(0);
        expect(nextDefender?.handCards).toHaveLength(
            defenderHandCount + tableCardCount,
        );
        expect(result.gameState?.roundRoleState.attackSeat).toBe(
            collecting.roundRoleState.attackSeat,
        );
        expect(result.gameState?.roundRoleState.defendSeat).toBe(
            (collecting.roundRoleState.defendSeat + 1) %
                collecting.players.length,
        );
        expect(result.gameState?.roundBattleState.roundResult).toBe(
            RoundResult.NONE,
        );
        expect(checkCardConservation(result.gameState!).success).toBe(true);
    });

    it("keeps the winning main attacker after defense failed across seat zero", () => {
        /** 构造机器人3主攻、机器人4受攻失败的跨座位 0 轮转场景。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "heart-2")],
            defenderHandCards: [requireCard(cards, "spade-2")],
            supportHandCards: [requireCard(cards, "heart-3")],
            supportTwoHandCards: [requireCard(cards, "spade-3")],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                },
            ],
        });
        game.roundRoleState = {
            attackSeat: 2,
            defendSeat: 3,
            supportSeats: [0, 1],
            currentTurnSeat: 3,
        };
        game.players[0]!.name = "我";
        game.players[1]!.name = "机器人2";
        game.players[2]!.name = "机器人3";
        game.players[3]!.name = "机器人4";

        /** 受攻失败后，主攻胜应保持座位 2 为下轮主攻，并攻击上轮受攻方下家座位 0。 */
        const defender = game.players.find((player) => player.seat === 3)!;
        const collecting = applyGameAction(game, defender.playerId, {
            actionType: GameActionType.GIVE_UP_DEFENSE,
        }).gameState!;
        const stopped = stopAllAttackRoles(collecting);
        const result = applyGameAction(stopped, defender.playerId, {
            actionType: GameActionType.COLLECT_TABLE_CARDS,
        });
        expect(result.success).toBe(true);
        expect(result.gameState?.roundRoleState.attackSeat).toBe(2);
        expect(result.gameState?.roundRoleState.defendSeat).toBe(0);
        expect(createPlayerView(result.gameState!, "attacker").message).toBe(
            "机器人3 首攻，我 受攻",
        );
    });

    it("recalls a placed defense card back to defender hand", () => {
        /** 构造一个已有守牌的桌面牌位，用于验证撤回动作。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const attackCard = requireCard(cards, "diamond-7");
        const defenseCard = requireCard(cards, "diamond-8");
        const spareCard = requireCard(cards, "spade-2");
        const game = createManualRoundState({
            defenderHandCards: [spareCard],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard,
                    defendCard: defenseCard,
                },
            ],
        });

        /** 撤回后守牌应回到受攻方手牌，桌面牌位变回未防守。 */
        const result = applyGameAction(game, "defender", {
            actionType: GameActionType.RECALL_DEFENSE_CARD,
            sourcePairId: "pair-1",
        });
        const defender = result.gameState?.players.find(
            (player) => player.playerId === "defender",
        );
        expect(result.success).toBe(true);
        expect(result.gameState?.tablePairs[0]?.defendCard).toBeUndefined();
        expect(
            defender?.handCards.some((card) => card.id === "diamond-8"),
        ).toBe(true);
        expect(checkCardConservation(result.gameState!).success).toBe(true);
    });

    it("moves a defense card to another valid pair", () => {
        /** 构造守牌可压制另一个目标牌位的场景。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            defenderHandCards: [requireCard(cards, "spade-2")],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                    defendCard: requireCard(cards, "diamond-8"),
                },
                {
                    pairId: "pair-2",
                    attackCard: requireCard(cards, "diamond-6"),
                },
            ],
        });

        /** 移动后来源牌位应清空，目标牌位获得原守牌。 */
        const result = applyGameAction(game, "defender", {
            actionType: GameActionType.MOVE_DEFENSE_CARD,
            sourcePairId: "pair-1",
            targetPairId: "pair-2",
        });
        expect(result.success).toBe(true);
        expect(result.gameState?.tablePairs[0]?.defendCard).toBeUndefined();
        expect(result.gameState?.tablePairs[1]?.defendCard?.id).toBe(
            "diamond-8",
        );
        expect(checkCardConservation(result.gameState!).success).toBe(true);
    });

    it("rejects moving a defense card when the target cannot be covered", () => {
        /** 构造守牌移动后无法压制目标攻牌的非法场景。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            defenderHandCards: [requireCard(cards, "spade-2")],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                    defendCard: requireCard(cards, "diamond-8"),
                },
                {
                    pairId: "pair-2",
                    attackCard: requireCard(cards, "spade-K"),
                },
            ],
        });

        /** 非法移动必须被核心规则拒绝，原状态不应被污染。 */
        const result = applyGameAction(game, "defender", {
            actionType: GameActionType.MOVE_DEFENSE_CARD,
            sourcePairId: "pair-1",
            targetPairId: "pair-2",
        });
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(GameErrorCode.DEFENSE_MOVE_INVALID);
    });

    it("seals attack when defender plays a joker as defense", () => {
        /** 大小王作为守牌时应触发封攻。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const attackCard = requireCard(cards, "diamond-7");
        const sealCard = requireCard(cards, "joker-small");
        const game = createManualRoundState({
            defenderHandCards: [sealCard],
            tablePairs: [{ pairId: "pair-1", attackCard }],
        });

        /** 防守成功后当前轮进入封攻状态，并记录触发封攻的王。 */
        const result = applyGameAction(game, "defender", {
            actionType: GameActionType.PLAY_DEFENSE_CARD,
            cardId: sealCard.id,
            targetPairId: "pair-1",
        });
        expect(result.success).toBe(true);
        expect(result.gameState?.roundBattleState.isAttackSealed).toBe(true);
        expect(result.gameState?.roundBattleState.sealCardRank).toBe(
            CardRank.SMALL_JOKER,
        );
    });

    it("only allows the other joker to attack after attack is sealed", () => {
        /** 构造已经由小王封攻的状态，用于验证封攻后的加攻限制。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "joker-big")],
            supportHandCards: [requireCard(cards, "diamond-7")],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-6"),
                    defendCard: requireCard(cards, "joker-small"),
                },
            ],
        });
        game.roundBattleState.isAttackSealed = true;
        game.roundBattleState.sealCardRank = CardRank.SMALL_JOKER;

        /** 普通同点牌在封攻后必须被拒绝。 */
        const rejected = applyGameAction(game, "support", {
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: "diamond-7",
        });
        /** 另一张王在封攻后仍可作为特殊攻牌进入桌面。 */
        const accepted = applyGameAction(game, "attacker", {
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: "joker-big",
        });
        expect(rejected.success).toBe(false);
        expect(rejected.errorCode).toBe(GameErrorCode.ATTACK_SEALED);
        expect(accepted.success).toBe(true);
        expect(accepted.gameState?.tablePairs[1]?.attackCard.id).toBe(
            "joker-big",
        );
    });

    it("refills defender cards during round when uncovered pairs remain", () => {
        /** 构造受攻方最后一张牌防住其中一张攻牌，但桌面仍有未防住牌。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const defenseCard = requireCard(cards, "diamond-8");
        const game = createManualRoundState({
            defenderHandCards: [defenseCard],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                },
                {
                    pairId: "pair-2",
                    attackCard: requireCard(cards, "spade-6"),
                },
            ],
        });

        /** 出完最后一张守牌后仍有未防住牌，应自动中途添牌并继续当前轮。 */
        const result = applyGameAction(game, "defender", {
            actionType: GameActionType.PLAY_DEFENSE_CARD,
            cardId: defenseCard.id,
            targetPairId: "pair-1",
        });
        const defender = result.gameState?.players.find(
            (player) => player.playerId === "defender",
        );
        expect(result.success).toBe(true);
        expect(result.gameState?.phase).toBe(GamePhase.ROUND_ACTIVE);
        expect(defender?.handCards).toHaveLength(8);
        expect(result.gameState?.tablePairs).toHaveLength(2);
        expect(checkCardConservation(result.gameState!).success).toBe(true);
    });

    it("refills defender with remaining deck cards when deck is insufficient", () => {
        /** 构造牌堆只剩 3 张的中途添牌场景。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const defenseCard = requireCard(cards, "diamond-8");
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "heart-5")],
            defenderHandCards: [defenseCard],
            supportHandCards: [requireCard(cards, "heart-6")],
            supportTwoHandCards: [requireCard(cards, "heart-7")],
            deckCards: [
                requireCard(cards, "heart-2"),
                requireCard(cards, "heart-3"),
                requireCard(cards, "heart-4"),
            ],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                },
                {
                    pairId: "pair-2",
                    attackCard: requireCard(cards, "spade-6"),
                },
            ],
        });

        /** 牌堆不足 8 张时，只抽取剩余牌且不清空桌面。 */
        const result = applyGameAction(game, "defender", {
            actionType: GameActionType.PLAY_DEFENSE_CARD,
            cardId: defenseCard.id,
            targetPairId: "pair-1",
        });
        const defender = result.gameState?.players.find(
            (player) => player.playerId === "defender",
        );
        expect(result.success).toBe(true);
        expect(result.gameState?.phase).toBe(GamePhase.ROUND_ACTIVE);
        expect(defender?.handCards).toHaveLength(3);
        expect(result.gameState?.deck).toHaveLength(0);
        expect(result.gameState?.isNoRefillMode).toBe(true);
        expect(result.gameState?.tablePairs).toHaveLength(2);
        expect(checkCardConservation(result.gameState!).success).toBe(true);
    });

    it("keeps round active after all cards are defended until attackers stop", () => {
        /** 构造所有当前攻牌已被防住，但助攻方仍可根据守牌点数继续加攻的局面。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            defenderHandCards: [requireCard(cards, "spade-2")],
            supportHandCards: [requireCard(cards, "heart-8")],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                    defendCard: requireCard(cards, "diamond-8"),
                },
            ],
        });

        /** 防守完成不应自动结算，攻击方仍可以按桌面已有点数追加攻牌。 */
        const result = applyGameAction(game, "support", {
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: "heart-8",
        });
        expect(result.success).toBe(true);
        expect(result.gameState?.phase).toBe(GamePhase.ROUND_ACTIVE);
        expect(result.gameState?.roundBattleState.roundResult).toBe(
            RoundResult.NONE,
        );
        expect(result.gameState?.tablePairs).toHaveLength(2);
    });

    it("starts next round after defense succeeds and every attack role stops", () => {
        /** 构造所有攻牌已经防住的局面，验证主攻和助攻全部停攻后自动进入下一轮。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                    defendCard: requireCard(cards, "diamond-8"),
                },
            ],
        });

        /** 前两个攻击角色停止后，本轮仍未结束。 */
        const firstStopped = applyGameAction(game, "attacker", {
            actionType: GameActionType.STOP_ATTACK,
        }).gameState!;
        const secondStopped = applyGameAction(firstStopped, "support", {
            actionType: GameActionType.STOP_ATTACK,
        }).gameState!;
        expect(secondStopped.phase).toBe(GamePhase.ROUND_ACTIVE);
        expect(secondStopped.roundBattleState.roundResult).toBe(
            RoundResult.NONE,
        );

        /** 最后一名助攻也停止后，才形成受攻成功结果。 */
        const result = applyGameAction(secondStopped, "support-2", {
            actionType: GameActionType.STOP_ATTACK,
        });
        expect(result.success).toBe(true);
        expect(result.gameState?.phase).toBe(GamePhase.FIRST_ATTACK_READY);
        expect(result.gameState?.roundBattleState.roundResult).toBe(
            RoundResult.NONE,
        );
        expect(result.gameState?.tablePairs).toHaveLength(0);
        expect(result.gameState?.discardPile).toHaveLength(2);
        expect(result.gameState?.roundRoleState.attackSeat).toBe(
            game.roundRoleState.defendSeat,
        );
        expect(result.gameState?.roundRoleState.currentTurnSeat).toBe(
            game.roundRoleState.defendSeat,
        );
    });

    it("rejects attack from a player who already stopped attack", () => {
        /** 构造攻击方停攻后仍尝试继续加攻的非法场景。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "heart-8")],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                    defendCard: requireCard(cards, "diamond-8"),
                },
            ],
        });
        const stopped = applyGameAction(game, "attacker", {
            actionType: GameActionType.STOP_ATTACK,
        }).gameState!;

        /** 已经停攻的玩家不能再用桌面已有点数继续出攻牌。 */
        const result = applyGameAction(stopped, "attacker", {
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: "heart-8",
        });
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(GameErrorCode.ATTACK_ALREADY_STOPPED);
    });

    it("does not refill players after a round when no-refill mode has started", () => {
        /** 构造只出不添阶段的受攻成功局面，验证轮后不会再补牌。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "heart-2")],
            defenderHandCards: [requireCard(cards, "spade-2")],
            supportHandCards: [requireCard(cards, "heart-3")],
            supportTwoHandCards: [requireCard(cards, "spade-3")],
            deckCards: [],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                    defendCard: requireCard(cards, "diamond-8"),
                },
            ],
        });
        game.isNoRefillMode = true;

        /** 攻击角色全部停攻后进入下一轮，但所有玩家手牌数量不应被补到 8 张。 */
        const resultState = stopAllAttackRoles(game);
        expect(resultState.phase).toBe(GamePhase.FIRST_ATTACK_READY);
        expect(resultState.deck).toHaveLength(0);
        expect(resultState.isNoRefillMode).toBe(true);
        expect(
            resultState.players.map((player) => player.handCards.length),
        ).toEqual([1, 1, 1, 1]);
        expect(checkCardConservation(resultState).success).toBe(true);
    });

    it("records rank when a player uses the last hand card in no-refill mode", () => {
        /** 构造攻击方只剩一张可追加攻牌的只出不添局面。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "heart-8")],
            defenderHandCards: [requireCard(cards, "spade-2")],
            supportHandCards: [requireCard(cards, "heart-3")],
            supportTwoHandCards: [requireCard(cards, "spade-3")],
            deckCards: [],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                    defendCard: requireCard(cards, "diamond-8"),
                },
            ],
        });
        game.isNoRefillMode = true;

        /** 攻击方打完最后一张手牌后，只登记名次并退出后续操作，当前轮继续。 */
        const result = applyGameAction(game, "attacker", {
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: "heart-8",
        });
        const attacker = result.gameState?.players.find(
            (player) => player.playerId === "attacker",
        );
        expect(result.success).toBe(true);
        expect(attacker?.status).toBe(PlayerStatus.FINISHED);
        expect(attacker?.rank).toBe(1);
        expect(result.gameState?.phase).toBe(GamePhase.ROUND_ACTIVE);
        expect(result.gameState?.tablePairs).toHaveLength(2);
        expect(result.gameState?.roundBattleState.roundResult).toBe(
            RoundResult.NONE,
        );
        expect(
            result.gameState?.roundRoleState.supportSeats.includes(
                game.roundRoleState.attackSeat,
            ),
        ).toBe(false);
        expect(checkCardConservation(result.gameState!).success).toBe(true);
    });

    it("ends current round when defender uses the last defense card in no-refill mode", () => {
        /** 构造受攻方只剩一张可守牌的只出不添局面。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "heart-2")],
            defenderHandCards: [requireCard(cards, "diamond-8")],
            supportHandCards: [requireCard(cards, "heart-3")],
            supportTwoHandCards: [requireCard(cards, "spade-3")],
            deckCards: [],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                },
            ],
        });
        game.isNoRefillMode = true;
        const discardCountBefore = game.discardPile.length;

        /** 受攻方打完最后一张守牌后，应按受攻成功直接收口本轮并登记名次。 */
        const result = applyGameAction(game, "defender", {
            actionType: GameActionType.PLAY_DEFENSE_CARD,
            cardId: "diamond-8",
            targetPairId: "pair-1",
        });
        const defender = result.gameState?.players.find(
            (player) => player.playerId === "defender",
        );
        expect(result.success).toBe(true);
        expect(defender?.status).toBe(PlayerStatus.FINISHED);
        expect(defender?.rank).toBe(1);
        expect(result.gameState?.phase).toBe(GamePhase.FIRST_ATTACK_READY);
        expect(result.gameState?.tablePairs).toHaveLength(0);
        expect(result.gameState?.discardPile).toHaveLength(
            discardCountBefore + 2,
        );
        expect(result.gameState?.roundRoleState.attackSeat).not.toBe(
            game.roundRoleState.defendSeat,
        );
        expect(checkCardConservation(result.gameState!).success).toBe(true);
    });

    it("keeps round playable after main attacker finishes last card until defender collects after supports stop", () => {
        /** 构造主攻方最后一张加攻后出完牌，但助攻和受攻方仍需继续处理当前轮。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "heart-8")],
            defenderHandCards: [requireCard(cards, "spade-2")],
            supportHandCards: [requireCard(cards, "heart-3")],
            supportTwoHandCards: [requireCard(cards, "spade-3")],
            deckCards: [],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                    defendCard: requireCard(cards, "diamond-8"),
                },
            ],
        });
        game.isNoRefillMode = true;
        const attacked = applyGameAction(game, "attacker", {
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: "heart-8",
        }).gameState!;

        /** 主攻方已完成后不再操作，受攻方仍可选择放弃防守进入收牌追加阶段。 */
        const collecting = applyGameAction(attacked, "defender", {
            actionType: GameActionType.GIVE_UP_DEFENSE,
        }).gameState!;
        const supportStopped = applyGameAction(collecting, "support", {
            actionType: GameActionType.STOP_ATTACK,
        }).gameState!;
        const allSupportStopped = applyGameAction(supportStopped, "support-2", {
            actionType: GameActionType.STOP_ATTACK,
        }).gameState!;

        /** 主攻方已完成应等同于退出进攻确认，助攻停攻后受攻方可以确认收牌。 */
        const result = applyGameAction(allSupportStopped, "defender", {
            actionType: GameActionType.COLLECT_TABLE_CARDS,
        });
        expect(result.success).toBe(true);
        expect(result.gameState?.phase).toBe(GamePhase.FIRST_ATTACK_READY);
        expect(result.gameState?.tablePairs).toHaveLength(0);
        expect(checkCardConservation(result.gameState!).success).toBe(true);
    });

    it("lets defender win after using last card even with uncovered attack cards when no refill is available", () => {
        /** 构造受攻方只能防住其中一张攻牌，且牌堆已空无法继续补牌的局面。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "heart-2")],
            defenderHandCards: [requireCard(cards, "diamond-8")],
            supportHandCards: [requireCard(cards, "heart-3")],
            supportTwoHandCards: [requireCard(cards, "spade-3")],
            deckCards: [],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                },
                {
                    pairId: "pair-2",
                    attackCard: requireCard(cards, "spade-6"),
                },
            ],
        });
        game.isNoRefillMode = true;
        const discardCountBefore = game.discardPile.length;

        /** 无牌可补时，受攻方打空手牌即完成，不再要求全部攻牌都有守牌。 */
        const result = applyGameAction(game, "defender", {
            actionType: GameActionType.PLAY_DEFENSE_CARD,
            cardId: "diamond-8",
            targetPairId: "pair-1",
        });
        const defender = result.gameState?.players.find(
            (player) => player.playerId === "defender",
        );
        expect(result.success).toBe(true);
        expect(defender?.status).toBe(PlayerStatus.FINISHED);
        expect(defender?.rank).toBe(1);
        expect(result.gameState?.phase).toBe(GamePhase.FIRST_ATTACK_READY);
        expect(result.gameState?.tablePairs).toHaveLength(0);
        expect(result.gameState?.discardPile).toHaveLength(
            discardCountBefore + 3,
        );
        expect(checkCardConservation(result.gameState!).success).toBe(true);
    });

    it("finishes the game when only one active player remains in no-refill mode", () => {
        /** 构造两名玩家已完成，主攻方打完最后一张牌后只剩受攻方的局面。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "heart-8")],
            defenderHandCards: [requireCard(cards, "spade-2")],
            deckCards: [],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                    defendCard: requireCard(cards, "diamond-8"),
                },
            ],
        });
        game.isNoRefillMode = true;
        game.players[2]!.status = PlayerStatus.FINISHED;
        game.players[2]!.rank = 1;
        game.players[3]!.status = PlayerStatus.FINISHED;
        game.players[3]!.rank = 2;

        /** 主攻方完成第三名后，系统应自动把唯一剩余玩家登记为最后一名并结束。 */
        const result = applyGameAction(game, "attacker", {
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: "heart-8",
        });
        expect(result.success).toBe(true);
        expect(result.gameState?.phase).toBe(GamePhase.GAME_OVER);
        expect(
            result.gameState?.players.find(
                (player) => player.playerId === "attacker",
            )?.rank,
        ).toBe(3);
        expect(
            result.gameState?.players.find(
                (player) => player.playerId === "defender",
            )?.rank,
        ).toBe(4);
    });

    it("skips finished players when creating next round roles", () => {
        /** 构造受攻方本轮防守成功且手牌已空，结算后应排名并跳过后续轮转。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "heart-2")],
            supportHandCards: [requireCard(cards, "heart-3")],
            supportTwoHandCards: [requireCard(cards, "spade-3")],
            deckCards: [],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                    defendCard: requireCard(cards, "diamond-8"),
                },
            ],
        });
        game.isNoRefillMode = true;

        /** 受攻方已在只出不添阶段出完牌，应直接胜出并由下一名活跃玩家接替主攻。 */
        const resultState = applyGameAction(game, "attacker", {
            actionType: GameActionType.STOP_ATTACK,
        }).gameState!;
        const defender = resultState.players.find(
            (player) => player.playerId === "defender",
        );
        expect(defender?.status).toBe(PlayerStatus.FINISHED);
        expect(resultState.roundRoleState.attackSeat).toBe(2);
        expect(resultState.roundRoleState.defendSeat).toBe(3);
        expect(resultState.roundRoleState.supportSeats).toEqual([0]);
    });

    it("marks non-current players as bots by default when creating a game", () => {
        /** 默认创建对局用于验证首版单人体验会生成机器人玩家。 */
        const result = createGame({
            seed: 20260623,
            currentPlayerId: "player-1",
        });
        expect(result.success).toBe(true);
        expect(result.gameState?.players[0]?.isBot).toBe(false);
        expect(
            result.gameState?.players.slice(1).every((player) => player.isBot),
        ).toBe(true);
    });

    it("creates a game from external player identities", () => {
        /** 外部玩家身份用于验证后端可先组装账号和机器人，再交给核心发牌。 */
        const result = createGame({
            seed: 20260623,
            currentPlayerId: "human-player",
            players: [
                {
                    playerId: "human-player",
                    accountId: "account-human",
                    seat: 0,
                    name: "玩家账号",
                    playerType: PlayerType.HUMAN,
                    avatarUrl: "https://example.test/avatar.png",
                },
                {
                    playerId: "bot-player-2",
                    accountId: "bot-account-2",
                    seat: 1,
                    name: "机器人账号2",
                    playerType: PlayerType.BOT,
                    botProfileId: "default-bot-2",
                },
                {
                    playerId: "bot-player-3",
                    accountId: "bot-account-3",
                    seat: 2,
                    name: "机器人账号3",
                    playerType: PlayerType.BOT,
                    botProfileId: "default-bot-3",
                },
                {
                    playerId: "bot-player-4",
                    accountId: "bot-account-4",
                    seat: 3,
                    name: "机器人账号4",
                    playerType: PlayerType.BOT,
                    botProfileId: "default-bot-4",
                },
            ],
        });
        expect(result.success).toBe(true);
        expect(result.gameState?.players[0]).toMatchObject({
            playerId: "human-player",
            accountId: "account-human",
            playerType: PlayerType.HUMAN,
            isBot: false,
        });
        expect(result.gameState?.players[1]).toMatchObject({
            playerId: "bot-player-2",
            accountId: "bot-account-2",
            playerType: PlayerType.BOT,
            botProfileId: "default-bot-2",
            isBot: true,
        });

        /** 玩家视图也需要带出身份字段，后续个人页、机器人账号和战绩可直接复用。 */
        const viewState = createPlayerView(result.gameState!, "human-player");
        expect(viewState.players[0]).toMatchObject({
            accountId: "account-human",
            playerType: PlayerType.HUMAN,
            avatarUrl: "https://example.test/avatar.png",
        });
        expect(viewState.players[1]).toMatchObject({
            accountId: "bot-account-2",
            playerType: PlayerType.BOT,
            botProfileId: "default-bot-2",
        });
    });

    it("rejects external player identities with non-continuous seats", () => {
        /** 座位不连续会破坏顺时针轮转，因此创建阶段必须拒绝。 */
        const result = createGame({
            seed: 20260623,
            players: [
                {
                    playerId: "human-player",
                    seat: 0,
                    name: "玩家账号",
                    playerType: PlayerType.HUMAN,
                },
                {
                    playerId: "bot-player-3",
                    seat: 2,
                    name: "机器人账号3",
                    playerType: PlayerType.BOT,
                    botProfileId: "default-bot-3",
                },
            ],
        });
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(GameErrorCode.INVALID_ACTION_ARGUMENT);
    });

    it("reveals bot hands but still hides non-bot opponent hands in player view", () => {
        /** 构造包含机器人和普通对手的视图状态，验证手牌可见性边界。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "heart-2")],
            defenderHandCards: [requireCard(cards, "heart-3")],
            supportHandCards: [requireCard(cards, "heart-4")],
            supportTwoHandCards: [requireCard(cards, "heart-5")],
            tablePairs: [],
        });
        game.players[2]!.isBot = true;

        /** 当前玩家能看到自己和机器人的手牌，但看不到普通对手手牌明细。 */
        const viewState = createPlayerView(game, "attacker");
        expect(
            viewState.players.find((player) => player.playerId === "attacker")
                ?.handCards,
        ).toHaveLength(1);
        expect(
            viewState.players.find((player) => player.playerId === "support")
                ?.handCards,
        ).toHaveLength(1);
        expect(
            viewState.players.find((player) => player.playerId === "defender")
                ?.handCards,
        ).toHaveLength(0);
    });

    it("lets a defense bot cover a human attack card in one bot step", () => {
        /** 构造真人主攻、机器人受攻的局面，验证真人出牌后机器人自动防守。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "diamond-7")],
            defenderHandCards: [requireCard(cards, "diamond-8")],
            supportHandCards: [requireCard(cards, "heart-2")],
            supportTwoHandCards: [requireCard(cards, "heart-3")],
            tablePairs: [],
        });
        game.phase = GamePhase.FIRST_ATTACK_READY;
        game.roundRoleState.currentTurnSeat = game.roundRoleState.attackSeat;
        game.players[1]!.isBot = true;

        /** 主攻方打出首张攻牌后，只标记存在待推进机器人动作。 */
        const result = applyGameAction(game, "attacker", {
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: "diamond-7",
        });
        expect(result.success).toBe(true);
        expect(hasPendingBotAction(result.gameState!)).toBe(true);

        /** 推进一个机器人动作后，机器人受攻方用最小合法牌覆盖。 */
        const botStep = applyBotActionStep(result.gameState!);
        expect(botStep.success).toBe(true);
        expect(botStep.gameState?.tablePairs[0]?.defendCard?.id).toBe(
            "diamond-8",
        );
        expect(
            botStep.events.some(
                (event) => event.type === GameEventType.BOT_ACTION_SELECTED,
            ),
        ).toBe(true);
        expect(
            botStep.events.some(
                (event) => event.type === GameEventType.DEFENSE_CARD_PLAYED,
            ),
        ).toBe(true);
    });

    it("lets a defense bot give up in one bot step when no legal defense card exists", () => {
        /** 构造机器人受攻方无法压制攻牌的局面，验证自动放弃防守。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "diamond-A")],
            defenderHandCards: [requireCard(cards, "diamond-K")],
            supportHandCards: [requireCard(cards, "heart-2")],
            supportTwoHandCards: [requireCard(cards, "heart-3")],
            tablePairs: [],
        });
        game.phase = GamePhase.FIRST_ATTACK_READY;
        game.roundRoleState.currentTurnSeat = game.roundRoleState.attackSeat;
        game.players[1]!.isBot = true;

        /** 真人主攻后，只标记存在待推进机器人动作。 */
        const result = applyGameAction(game, "attacker", {
            actionType: GameActionType.PLAY_ATTACK_CARD,
            cardId: "diamond-A",
        });
        expect(result.success).toBe(true);
        expect(hasPendingBotAction(result.gameState!)).toBe(true);

        /** 推进一个机器人动作后，机器人无合法守牌并放弃防守。 */
        const botStep = applyBotActionStep(result.gameState!);
        expect(botStep.success).toBe(true);
        expect(botStep.gameState?.phase).toBe(GamePhase.DEFENSE_COLLECTING);
        expect(botStep.gameState?.roundBattleState.roundResult).toBe(
            RoundResult.DEFENSE_FAILED,
        );
        expect(
            botStep.events.some(
                (event) => event.type === GameEventType.BOT_ACTION_SELECTED,
            ),
        ).toBe(true);
        expect(
            botStep.events.some(
                (event) => event.type === GameEventType.DEFENSE_GIVEN_UP,
            ),
        ).toBe(true);
    });

    it("keeps an attack bot waiting instead of stopping before all attack cards are defended", () => {
        /** 构造真人受攻方还未防住桌面牌，机器人助攻方也没有合法加攻牌的局面。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "heart-2")],
            defenderHandCards: [requireCard(cards, "diamond-8")],
            supportHandCards: [requireCard(cards, "heart-3")],
            supportTwoHandCards: [requireCard(cards, "spade-4")],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                },
            ],
        });
        game.players[2]!.isBot = true;

        /** 未全部防住且机器人无合法加攻牌时，不应自动停止进攻。 */
        expect(hasPendingBotAction(game)).toBe(false);
        const result = applyBotActionStep(game);
        expect(result.success).toBe(true);
        expect(result.events).toHaveLength(0);
        expect(result.gameState?.roundBattleState.stoppedAttackSeats).toEqual(
            [],
        );
    });

    it("does not let bot keep exchanging trump after deck is empty", () => {
        /** 构造牌堆已空但机器人手中有小于旧底牌的主牌，验证不会陷入换底轮询。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "heart-2")],
            defenderHandCards: [requireCard(cards, "diamond-8")],
            supportHandCards: [requireCard(cards, "club-3")],
            supportTwoHandCards: [requireCard(cards, "spade-4")],
            deckCards: [],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                },
            ],
        });
        game.isNoRefillMode = true;
        game.trumpCard = requireCard(cards, "club-7");
        game.players[2]!.isBot = true;

        /** 牌堆没有底牌时，不应枚举换底动作，也不应返回待机器人动作。 */
        const legalActions = getLegalActions(game, "support");
        expect(
            legalActions.some(
                (action) =>
                    action.actionType === GameActionType.EXCHANGE_TRUMP_CARD,
            ),
        ).toBe(false);
        expect(hasPendingBotAction(game)).toBe(false);
    });

    it("lets an attack bot add a legal attack card as soon as it can", () => {
        /** 构造真人受攻方还未防住桌面牌，但机器人助攻方手中有同点牌的局面。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "heart-2")],
            defenderHandCards: [requireCard(cards, "diamond-8")],
            supportHandCards: [requireCard(cards, "heart-7")],
            supportTwoHandCards: [requireCard(cards, "spade-4")],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                },
            ],
        });
        game.players[2]!.isBot = true;

        /** 只要机器人手中有可追加点数，就应立即出牌而不是等待防守完成。 */
        expect(hasPendingBotAction(game)).toBe(true);
        const result = applyBotActionStep(game);
        expect(result.success).toBe(true);
        expect(result.gameState?.tablePairs).toHaveLength(2);
        expect(result.gameState?.tablePairs[1]?.attackCard.id).toBe("heart-7");
        expect(
            result.events.some(
                (event) => event.type === GameEventType.ATTACK_CARD_PLAYED,
            ),
        ).toBe(true);
    });

    it("lets attack bots stop and then lets a defense bot collect cards by steps", () => {
        /** 构造收牌阶段攻击方和受攻方都是机器人时的单步停攻和收牌流程。 */
        const cards = markTrumpCards(createStandardDeck(), CardSuit.CLUB);
        const game = createManualRoundState({
            attackerHandCards: [requireCard(cards, "heart-2")],
            defenderHandCards: [requireCard(cards, "spade-2")],
            supportHandCards: [requireCard(cards, "heart-3")],
            supportTwoHandCards: [requireCard(cards, "spade-3")],
            tablePairs: [
                {
                    pairId: "pair-1",
                    attackCard: requireCard(cards, "diamond-7"),
                },
            ],
        });
        game.phase = GamePhase.DEFENSE_COLLECTING;
        game.roundBattleState.roundResult = RoundResult.DEFENSE_FAILED;
        game.players[1]!.isBot = true;
        game.players[2]!.isBot = true;
        game.players[3]!.isBot = true;

        /** 真人主攻停攻后，剩余机器人动作需要逐步推进。 */
        const firstResult = applyGameAction(game, "attacker", {
            actionType: GameActionType.STOP_ATTACK,
        });
        expect(firstResult.success).toBe(true);
        expect(hasPendingBotAction(firstResult.gameState!)).toBe(true);

        /** 两名助攻机器人依次停止进攻。 */
        const supportStopped = applyBotActionStep(firstResult.gameState!);
        expect(supportStopped.success).toBe(true);
        expect(supportStopped.gameState?.phase).toBe(
            GamePhase.DEFENSE_COLLECTING,
        );
        const supportTwoStopped = applyBotActionStep(supportStopped.gameState!);
        expect(supportTwoStopped.success).toBe(true);
        expect(supportTwoStopped.gameState?.phase).toBe(
            GamePhase.DEFENSE_COLLECTING,
        );

        /** 攻击方全部停攻后，受攻机器人再单步确认收牌。 */
        const collected = applyBotActionStep(supportTwoStopped.gameState!);
        expect(collected.success).toBe(true);
        expect(collected.gameState?.phase).toBe(GamePhase.FIRST_ATTACK_READY);
        expect(collected.gameState?.tablePairs).toHaveLength(0);
        expect(
            collected.events.some(
                (event) => event.type === GameEventType.TABLE_CARDS_COLLECTED,
            ),
        ).toBe(true);
    });
});
