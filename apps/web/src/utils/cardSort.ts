/**
 * 手牌排序工具，统一承载一键排序、自动排序和机器人手牌展示顺序。
 */
import { CardRank, CardSuit } from "@gonghua/contracts";
import type { CardDTO } from "@gonghua/contracts";

/**
 * 手牌排序点数权重，数值越大表示规则牌力越大。
 */
const CARD_RANK_WEIGHT: Record<CardRank, number> = {
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
 * 计算单张手牌在排序中的分类位置。
 */
function getCardSortGroup(card: CardDTO, trumpSuit: CardSuit): number {
    if (card.rank === CardRank.BIG_JOKER) {
        return 0;
    }
    if (card.rank === CardRank.SMALL_JOKER) {
        return 1;
    }
    if (card.suit === trumpSuit && !card.isSealCard) {
        return 2;
    }
    return 3;
}

/**
 * 按攻花规则对手牌进行从左到右排列，非主牌不按花色分组。
 */
export function sortCardsByRule(
    cards: CardDTO[],
    trumpSuit: CardSuit,
): CardDTO[] {
    return cards.slice().sort((left, right) => {
        const groupDiff =
            getCardSortGroup(left, trumpSuit) -
            getCardSortGroup(right, trumpSuit);
        if (groupDiff !== 0) {
            return groupDiff;
        }
        return CARD_RANK_WEIGHT[right.rank] - CARD_RANK_WEIGHT[left.rank];
    });
}
