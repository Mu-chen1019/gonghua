/**
 * 对局创建模块。
 *
 * 本文件以 `createGame` 创建完整初始 `GameState`，内部依次完成玩家创建、洗牌发牌、翻主牌、主牌标记、
 * 可换底提示和首攻角色计算。`determineFirstAttack` 单独导出给测试和后续服务编排复用；
 * 换底只交换底牌和玩家手牌，不会重新指定已经确定的攻守关系。
 */
import {
    CardDTO,
    CardRank,
    CardSuit,
    GameErrorCode,
    GameEventDTO,
    GameEventType,
    GameMode,
    GamePhase,
    PlayerIdentityDTO,
    PlayerStatus,
    PlayerType,
    RoundResult,
} from "@gonghua/contracts";
import {
    createSeededRandom,
    createStandardDeck,
    isNormalCard,
    markTrumpCards,
    shuffleDeck,
} from "../deck";
import { logGameAction } from "../logger";
import {
    CreateGameOptions,
    GameOperationResult,
    GameState,
    PlayerState,
    RoundRoleState,
} from "../model";
import { getRankWeight } from "../rules";
import {
    checkCardConservation,
    createFailure,
    createSuccess,
    findPlayerBySeat,
} from "./stateUtils";
import { findExchangeCard } from "./trumpRules";

/** 当前单副牌玩法支持的最少玩家数量。 */
const MIN_PLAYER_COUNT = 2;

/** 当前单副牌玩法支持的最多玩家数量，需保证初始发牌后仍有底牌可翻主。 */
const MAX_PLAYER_COUNT = 6;

/** 默认玩家数量，首版先按 4 人对局启动，同时保留后续多副牌扩展。 */
const DEFAULT_PLAYER_COUNT = 4;

/** 每名玩家初始手牌数量，也是后续常规添牌目标。 */
const INITIAL_HAND_SIZE = 8;

/**
 * 创建一局新的权威对局状态，并完成洗牌、发牌、翻主牌和首攻判定。
 */
export function createGame(
    options: CreateGameOptions = {},
): GameOperationResult {
    /** 本局玩家数量，外部身份列表优先决定座位数量。 */
    const playerCount =
        options.players?.length ?? options.playerCount ?? DEFAULT_PLAYER_COUNT;
    if (playerCount < MIN_PLAYER_COUNT || playerCount > MAX_PLAYER_COUNT) {
        return createFailure(
            GameErrorCode.INVALID_ACTION_ARGUMENT,
            "当前单副牌玩法支持 2 到 6 名玩家",
        );
    }
    if (
        options.players !== undefined &&
        options.playerCount !== undefined &&
        options.players.length !== options.playerCount
    ) {
        return createFailure(
            GameErrorCode.INVALID_ACTION_ARGUMENT,
            "玩家身份数量必须与玩家数量一致",
        );
    }
    const identityError = validatePlayerIdentities(
        options.players,
        playerCount,
    );
    if (identityError !== undefined) {
        return createFailure(
            GameErrorCode.INVALID_ACTION_ARGUMENT,
            identityError,
        );
    }

    /** 当前对局模式只保存到配置，具体动作合法性仍由玩家类型和阶段判断。 */
    const mode = options.mode ?? GameMode.NORMAL;
    /** 当前对局使用的随机种子，测试可传入固定值保证结果稳定。 */
    const seed = options.seed ?? Date.now();
    /** 当前对局的伪随机函数，统一供洗牌和兜底首攻使用。 */
    const random = createSeededRandom(seed);
    let deck = shuffleDeck(createStandardDeck(), random);
    let players = createPlayers(
        playerCount,
        options.currentPlayerId,
        options.enableBots ?? true,
        options.players,
    );

    for (let round = 0; round < INITIAL_HAND_SIZE; round += 1) {
        players = players.map((player) => {
            const nextCard = deck.shift();
            if (nextCard === undefined) {
                return player;
            }
            return { ...player, handCards: player.handCards.concat(nextCard) };
        });
    }
    logGameAction("game", "cards_dealt", {
        playerCount,
        handCount: INITIAL_HAND_SIZE,
        deckCount: deck.length,
        shuffleSeed: seed,
    });

    /** 翻主牌结果会把普通主牌放回牌堆底部。 */
    const trumpResult = revealTrumpCard(deck, random);
    if (trumpResult.trumpCard === undefined) {
        return createFailure(
            GameErrorCode.STATE_INCONSISTENT,
            "翻主牌失败：牌堆中没有普通牌",
        );
    }
    deck = trumpResult.deck;

    /** 最终普通主牌决定本局主花色。 */
    const trumpSuit = trumpResult.trumpCard.suit;
    players = players.map((player) => ({
        ...player,
        handCards: markTrumpCards(player.handCards, trumpSuit),
    }));
    deck = markTrumpCards(deck, trumpSuit);
    const trumpCard = deck[deck.length - 1];
    if (trumpCard === undefined) {
        return createFailure(
            GameErrorCode.STATE_INCONSISTENT,
            "翻主牌失败：牌堆为空",
        );
    }
    logGameAction("game", "trump_revealed", {
        trumpSuit,
        trumpCard: trumpCard.label,
        deckCount: deck.length,
    });

    /** 有玩家持有小于底部主牌的同主花色普通牌时，只提示可换底，不阻塞首攻流程。 */
    const exchangeReady = hasTrumpExchange(players, trumpCard);
    /** 首轮角色关系由主花色最小牌和兜底规则共同决定，换底不再形成阻塞阶段。 */
    const roleState = determineFirstAttack(players, trumpSuit, random);
    logGameAction("game", "first_attack_decided", {
        attackSeat: roleState.attackSeat,
        defendSeat: roleState.defendSeat,
        supportSeats: roleState.supportSeats.join(","),
        currentTurnSeat: roleState.currentTurnSeat,
        decisionBasis: "主花色最小牌或兜底规则",
    });
    /** 对局标识由服务端传入时优先使用，否则用种子生成可读标识。 */
    const gameId = options.gameId ?? `game-${seed}`;
    const gameState: GameState = {
        gameId,
        stateVersion: 0,
        phase: GamePhase.FIRST_ATTACK_READY,
        players,
        deck,
        trumpCard,
        trumpSuit,
        isNoRefillMode: false,
        tablePairs: [],
        discardPile: [],
        config: {
            mode,
            playerCount,
            initialHandSize: INITIAL_HAND_SIZE,
            seed,
        },
        roundRoleState: roleState,
        roundBattleState: {
            isAttackSealed: false,
            stoppedAttackSeats: [],
            roundResult: RoundResult.NONE,
        },
    };

    /** 开局完成后立即校验牌数，避免非法状态进入后续流程。 */
    const conservation = checkCardConservation(gameState);
    if (!conservation.success) {
        return createFailure(
            GameErrorCode.STATE_INCONSISTENT,
            conservation.errorMessage,
        );
    }

    /** 首攻玩家用于生成开局事件，换底不再阻塞首攻确定。 */
    const attackPlayer = findPlayerBySeat(players, roleState.attackSeat);
    const events: GameEventDTO[] = [
        { type: GameEventType.GAME_CREATED, message: "系统 创建 对局" },
        { type: GameEventType.CARDS_DEALT, message: "系统 发放 初始手牌" },
        {
            type: GameEventType.TRUMP_REVEALED,
            cardId: trumpCard.id,
            message: `系统 确定 主花色：${trumpCard.label}`,
        },
        ...(exchangeReady
            ? [
                  {
                      type: GameEventType.TRUMP_REVEALED,
                      message: "系统 提示 存在可换底玩家",
                  },
              ]
            : []),
        {
            type: GameEventType.FIRST_ATTACK_READY,
            playerId: attackPlayer.playerId,
            message: `系统 指定 首攻方：${attackPlayer.name}`,
        },
    ];
    logGameAction("game", "create", {
        gameId,
        phase: gameState.phase,
        playerCount,
        deckCount: deck.length,
    });
    return createSuccess(gameState, events);
}

/**
 * 根据主花色最小牌和兜底规则确定第一轮座位关系。
 */
export function determineFirstAttack(
    players: PlayerState[],
    trumpSuit: CardSuit,
    random: () => number,
): RoundRoleState {
    /** 持有普通主花色牌的候选玩家，按点数从小到大排序。 */
    const trumpCandidates = players.flatMap((player) =>
        player.handCards
            .filter((card) => !card.isSealCard && card.suit === trumpSuit)
            .map((card) => ({ seat: player.seat, rank: card.rank })),
    );
    trumpCandidates.sort(
        (left, right) => getRankWeight(left.rank) - getRankWeight(right.rank),
    );

    /** 首攻座位按普通主牌、小王、大王、随机合法玩家顺序兜底。 */
    const attackSeat =
        trumpCandidates[0]?.seat ??
        findSeatByRank(players, CardRank.SMALL_JOKER) ??
        findSeatByRank(players, CardRank.BIG_JOKER) ??
        players[Math.floor(random() * players.length)]?.seat ??
        0;
    /** 受攻方固定为主攻方顺时针下家。 */
    const defendSeat = (attackSeat + 1) % players.length;
    /** 其余座位都是助攻方。 */
    const supportSeats = players
        .map((player) => player.seat)
        .filter((seat) => seat !== attackSeat && seat !== defendSeat);
    return {
        attackSeat,
        defendSeat,
        supportSeats,
        currentTurnSeat: attackSeat,
    };
}

/**
 * 判断当前是否存在可换底玩家。
 */
function hasTrumpExchange(players: PlayerState[], trumpCard: CardDTO): boolean {
    return players.some(
        (player) => findExchangeCard(player.handCards, trumpCard) !== undefined,
    );
}

/**
 * 从牌堆顶部翻主牌，遇到大小王时放回并重洗，直到翻出普通牌。
 */
function revealTrumpCard(
    deck: CardDTO[],
    random: () => number,
): { deck: CardDTO[]; trumpCard?: CardDTO } {
    /** 当前翻主牌流程使用的牌堆副本。 */
    let currentDeck = deck.slice();
    while (currentDeck.length > 0) {
        /** 当前候选主牌，从牌堆顶部取出。 */
        const candidate = currentDeck.shift();
        if (candidate === undefined) {
            return { deck: currentDeck };
        }
        if (!isNormalCard(candidate)) {
            currentDeck = shuffleDeck(currentDeck.concat(candidate), random);
        } else {
            currentDeck.push(candidate);
            return { deck: currentDeck, trumpCard: candidate };
        }
    }
    return { deck: currentDeck };
}

/**
 * 创建初始玩家列表，首位玩家默认代表当前真人玩家。
 */
function createPlayers(
    playerCount: number,
    currentPlayerId?: string,
    enableBots = true,
    identities?: PlayerIdentityDTO[],
): PlayerState[] {
    if (identities !== undefined) {
        return identities
            .slice()
            .sort((left, right) => left.seat - right.seat)
            .map((identity) => ({
                playerId: identity.playerId,
                ...(identity.accountId === undefined
                    ? {}
                    : { accountId: identity.accountId }),
                seat: identity.seat,
                name: identity.name,
                playerType: identity.playerType,
                ...(identity.botProfileId === undefined
                    ? {}
                    : { botProfileId: identity.botProfileId }),
                ...(identity.avatarUrl === undefined
                    ? {}
                    : { avatarUrl: identity.avatarUrl }),
                isBot: identity.playerType === PlayerType.BOT,
                status: PlayerStatus.ACTIVE,
                handCards: [],
            }));
    }
    return Array.from({ length: playerCount }, (_, seat) => ({
        playerId:
            seat === 0 ? (currentPlayerId ?? "player-1") : `player-${seat + 1}`,
        accountId:
            seat === 0
                ? `local-${currentPlayerId ?? "player-1"}`
                : `bot-account-${seat + 1}`,
        seat,
        name: seat === 0 ? "我" : `机器人${seat + 1}`,
        playerType:
            enableBots && seat !== 0 ? PlayerType.BOT : PlayerType.HUMAN,
        ...(enableBots && seat !== 0
            ? { botProfileId: `default-bot-${seat + 1}` }
            : {}),
        isBot: enableBots && seat !== 0,
        status: PlayerStatus.ACTIVE,
        handCards: [],
    }));
}

/**
 * 校验外部传入的玩家身份快照，避免非法座位进入发牌流程。
 */
function validatePlayerIdentities(
    identities: PlayerIdentityDTO[] | undefined,
    playerCount: number,
): string | undefined {
    if (identities === undefined) {
        return undefined;
    }
    /** 玩家标识和座位必须唯一，且座位需要覆盖 0 到玩家数量减一。 */
    const playerIds = new Set(identities.map((identity) => identity.playerId));
    if (playerIds.size !== identities.length) {
        return "玩家标识不能重复";
    }
    const seats = new Set(identities.map((identity) => identity.seat));
    if (seats.size !== identities.length) {
        return "玩家座位不能重复";
    }
    for (let seat = 0; seat < playerCount; seat += 1) {
        if (!seats.has(seat)) {
            return "玩家座位必须从 0 开始连续分配";
        }
    }
    return undefined;
}

/**
 * 查找持有指定大小王牌的玩家座位。
 */
function findSeatByRank(
    players: PlayerState[],
    rank: CardRank,
): number | undefined {
    return players.find((player) =>
        player.handCards.some((card) => card.rank === rank),
    )?.seat;
}
