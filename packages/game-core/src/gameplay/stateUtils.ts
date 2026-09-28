/**
 * 对局状态工具模块。
 *
 * 本文件集中放置多个动作模块都会用到的状态辅助能力，包括牌数守恒、状态克隆、按座位找玩家、从手牌移除牌、
 * 创建封攻战斗状态以及统一成功/失败结果。动作模块通过这些函数保持“先克隆、再写入、最后统一返回”的处理方式，
 * 避免在多个文件里重复实现状态基础操作。
 */
import {
    CardDTO,
    CardRank,
    GameErrorCode,
    GameEventDTO,
} from "@gonghua/contracts";
import {
    CardConservationResult,
    GameOperationResult,
    GameState,
    PlayerState,
    RoundBattleState,
} from "../model";
import { logGameAction } from "../logger";

/** 标准牌堆总数，用于状态归属和牌数守恒校验。 */
const TOTAL_CARD_COUNT = 54;

/**
 * 校验全部 54 张牌是否只存在于一个合法区域内。
 */
export function checkCardConservation(
    gameState: GameState,
): CardConservationResult {
    /** 汇总所有区域中的卡牌，用于统计总数和唯一标识。 */
    const cards: CardDTO[] = [];
    for (const player of gameState.players) {
        cards.push(...player.handCards);
    }
    cards.push(...gameState.deck);
    for (const pair of gameState.tablePairs) {
        cards.push(pair.attackCard);
        if (pair.defendCard !== undefined) {
            cards.push(pair.defendCard);
        }
    }
    cards.push(...gameState.discardPile);

    /** 唯一卡牌标识集合，用于发现重复归属或丢牌。 */
    const uniqueIds = new Set(cards.map((card) => card.id));
    /** 牌堆未耗尽前底部主牌仍应归属于牌堆，轮后补牌耗尽牌堆后允许被正常抽走。 */
    const trumpInDeck = gameState.deck.some(
        (card) => card.id === gameState.trumpCard.id,
    );
    const success =
        cards.length === TOTAL_CARD_COUNT &&
        uniqueIds.size === TOTAL_CARD_COUNT &&
        (gameState.deck.length === 0 || trumpInDeck);
    return {
        success,
        totalCards: cards.length,
        deckCount: gameState.deck.length,
        handCount: gameState.players.reduce(
            (sum, player) => sum + player.handCards.length,
            0,
        ),
        tableCount: gameState.tablePairs.reduce(
            (sum, pair) => sum + 1 + (pair.defendCard === undefined ? 0 : 1),
            0,
        ),
        discardCount: gameState.discardPile.length,
        errorMessage: success ? "" : "牌数守恒或状态归属唯一性校验失败",
    };
}

/**
 * 克隆权威对局状态，确保动作处理不会直接修改入参。
 */
export function cloneGameState(gameState: GameState): GameState {
    return {
        ...gameState,
        players: gameState.players.map((player) => ({
            ...player,
            handCards: player.handCards.slice(),
        })),
        deck: gameState.deck.slice(),
        tablePairs: gameState.tablePairs.map((pair) => ({ ...pair })),
        discardPile: gameState.discardPile.slice(),
        roundRoleState: {
            ...gameState.roundRoleState,
            supportSeats: gameState.roundRoleState.supportSeats.slice(),
        },
        roundBattleState: {
            ...gameState.roundBattleState,
            stoppedAttackSeats:
                gameState.roundBattleState.stoppedAttackSeats?.slice() ?? [],
        },
    };
}

/**
 * 根据座位查找玩家；状态异常时抛出错误以暴露调用方问题。
 */
export function findPlayerBySeat(
    players: PlayerState[],
    seat: number,
): PlayerState {
    const player = players.find((item) => item.seat === seat);
    if (player === undefined) {
        throw new Error(`找不到座位 ${seat} 的玩家`);
    }
    return player;
}

/**
 * 从指定玩家手牌中移除卡牌，并返回被移除的卡牌。
 */
export function removeCardFromHand(
    player: PlayerState,
    cardId: string,
): CardDTO | undefined {
    const index = player.handCards.findIndex((card) => card.id === cardId);
    if (index < 0) {
        return undefined;
    }
    const card = player.handCards[index];
    if (card === undefined) {
        return undefined;
    }
    player.handCards.splice(index, 1);
    return card;
}

/**
 * 创建封攻后的战斗状态，首次封攻牌点数会被保留用于后续加攻限制。
 */
export function createSealedBattleState(
    current: RoundBattleState,
    sealCardRank: CardRank,
): RoundBattleState {
    return {
        isAttackSealed: true,
        sealCardRank: current.sealCardRank ?? sealCardRank,
        stoppedAttackSeats: current.stoppedAttackSeats?.slice() ?? [],
        roundResult: current.roundResult,
    };
}

/**
 * 创建成功操作结果。
 */
export function createSuccess(
    gameState: GameState,
    events: GameEventDTO[],
): GameOperationResult {
    return {
        success: true,
        gameState,
        events,
        errorCode: GameErrorCode.NONE,
        errorMessage: "",
    };
}

/**
 * 创建失败操作结果，并记录统一错误日志。
 */
export function createFailure(
    errorCode: GameErrorCode,
    errorMessage: string,
): GameOperationResult {
    logGameAction("game", "error", { errorCode, message: errorMessage });
    return {
        success: false,
        events: [],
        errorCode,
        errorMessage,
    };
}
