/**
 * 主牌相关规则工具。
 *
 * 本文件提供 `findExchangeCard`，用于在一组手牌中找出最小的可换底主牌。
 * `gameSetup` 用它判断是否需要提示存在可换底玩家，`trumpExchange` 用它执行真正换底；
 * 抽到独立文件是为了避免开局模块和换底动作模块形成循环依赖。
 */
import { CardDTO } from "@gonghua/contracts";
import { getRankWeight } from "../rules";

/**
 * 查找玩家手中最小的可换底主牌。
 */
export function findExchangeCard(
    handCards: CardDTO[],
    trumpCard: CardDTO,
): CardDTO | undefined {
    /** 只有同主花色普通牌，并且点数小于牌堆底部主牌，才允许换底。 */
    const candidates = handCards
        .filter(
            (card) =>
                !card.isSealCard &&
                card.suit === trumpCard.suit &&
                getRankWeight(card.rank) < getRankWeight(trumpCard.rank),
        )
        .sort(
            (left, right) =>
                getRankWeight(left.rank) - getRankWeight(right.rank),
        );
    return candidates[0];
}
