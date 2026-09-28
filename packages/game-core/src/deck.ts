/**
 * 牌堆工具模块。
 *
 * 本文件提供标准牌生成、可复现随机数、洗牌、主牌标记和普通牌识别能力。
 * `gameSetup` 会组合 `createStandardDeck`、`createSeededRandom`、`shuffleDeck` 和 `markTrumpCards`
 * 创建开局状态；规则判断模块只消费已经标记好的牌面信息，不在这里处理攻防逻辑。
 */
import { CardDTO, CardRank, CardSuit } from "@gonghua/contracts";

/**
 * 普通牌花色顺序仅用于生成整副牌，不代表规则优先级。
 */
export const NORMAL_CARD_SUITS: CardSuit[] = [
    CardSuit.HEART,
    CardSuit.DIAMOND,
    CardSuit.SPADE,
    CardSuit.CLUB,
];

/**
 * 普通牌点数顺序仅用于生成整副牌，实际大小比较由规则权重控制。
 */
export const NORMAL_CARD_RANKS: CardRank[] = [
    CardRank.ACE,
    CardRank.TWO,
    CardRank.THREE,
    CardRank.FOUR,
    CardRank.FIVE,
    CardRank.SIX,
    CardRank.SEVEN,
    CardRank.EIGHT,
    CardRank.NINE,
    CardRank.TEN,
    CardRank.JACK,
    CardRank.QUEEN,
    CardRank.KING,
];

/**
 * 花色中文展示文案，供卡牌创建时生成用户可读牌面。
 */
const SUIT_LABELS: Record<CardSuit, string> = {
    [CardSuit.HEART]: "红桃",
    [CardSuit.DIAMOND]: "方块",
    [CardSuit.SPADE]: "黑桃",
    [CardSuit.CLUB]: "梅花",
    [CardSuit.NONE]: "",
};

/**
 * 点数中文展示文案，供卡牌创建时生成用户可读牌面。
 */
const RANK_LABELS: Record<CardRank, string> = {
    [CardRank.ACE]: "A",
    [CardRank.TWO]: "2",
    [CardRank.THREE]: "3",
    [CardRank.FOUR]: "4",
    [CardRank.FIVE]: "5",
    [CardRank.SIX]: "6",
    [CardRank.SEVEN]: "7",
    [CardRank.EIGHT]: "8",
    [CardRank.NINE]: "9",
    [CardRank.TEN]: "10",
    [CardRank.JACK]: "J",
    [CardRank.QUEEN]: "Q",
    [CardRank.KING]: "K",
    [CardRank.SMALL_JOKER]: "小王",
    [CardRank.BIG_JOKER]: "大王",
};

/**
 * 创建一副标准 54 张扑克牌，并为每张牌分配唯一标识。
 */
export function createStandardDeck(): CardDTO[] {
    /** 生成过程中的临时牌堆，最终会包含普通牌和大小王。 */
    const cards: CardDTO[] = [];
    for (const suit of NORMAL_CARD_SUITS) {
        for (const rank of NORMAL_CARD_RANKS) {
            cards.push({
                id: `${suit}-${rank}`,
                suit,
                rank,
                label: `${SUIT_LABELS[suit]}${RANK_LABELS[rank]}`,
                isSealCard: false,
                isTrump: false,
            });
        }
    }
    cards.push({
        id: "joker-small",
        suit: CardSuit.NONE,
        rank: CardRank.SMALL_JOKER,
        label: RANK_LABELS[CardRank.SMALL_JOKER],
        isSealCard: true,
        isTrump: false,
    });
    cards.push({
        id: "joker-big",
        suit: CardSuit.NONE,
        rank: CardRank.BIG_JOKER,
        label: RANK_LABELS[CardRank.BIG_JOKER],
        isSealCard: true,
        isTrump: false,
    });
    return cards;
}

/**
 * 创建可复现的伪随机函数，用于测试中稳定复现洗牌结果。
 */
export function createSeededRandom(seed: number): () => number {
    /** 线性同余随机数当前值，限制在算法要求的正整数范围内。 */
    let value = seed % 2147483647;
    if (value <= 0) {
        value += 2147483646;
    }
    return () => {
        value = (value * 16807) % 2147483647;
        return (value - 1) / 2147483646;
    };
}

/**
 * 使用传入随机函数洗牌，返回新数组以避免修改调用方原始牌堆。
 */
export function shuffleDeck(cards: CardDTO[], random: () => number): CardDTO[] {
    /** 洗牌副本，避免外部状态被原地修改。 */
    const result = cards.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
        const target = Math.floor(random() * (index + 1));
        const currentCard = result[index];
        const targetCard = result[target];
        if (currentCard === undefined || targetCard === undefined) {
            continue;
        }
        result[index] = targetCard;
        result[target] = currentCard;
    }
    return result;
}

/**
 * 根据主花色标记所有普通主牌，大小王不会因为主花色变化变成主牌。
 */
export function markTrumpCards(
    cards: CardDTO[],
    trumpSuit: CardSuit,
): CardDTO[] {
    return cards.map((card) => ({
        ...card,
        isTrump: card.suit === trumpSuit && !card.isSealCard,
    }));
}

/**
 * 判断一张牌是否为可用于翻主牌的普通牌。
 */
export function isNormalCard(card: CardDTO): boolean {
    return !card.isSealCard && card.suit !== CardSuit.NONE;
}
