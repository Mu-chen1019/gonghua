/**
 * 游戏纯规则模块。
 *
 * 本文件集中提供点数权重、角色判断、守牌压制、加攻合法性、桌面防守完成度和防守整体合法性判断。
 * 所有函数都是无副作用判断函数，供 `legalActions`、机器人策略和各个 `gameplay` 动作模块复用；
 * 状态修改必须留在动作模块或结算模块中完成。
 */
import { CardDTO, CardRank, CardSuit } from "@gonghua/contracts";
import { RoundRoleState, TablePairState } from "./model";

/**
 * 点数比较权重，2 最小，A 在普通牌中最大，大王整体最大。
 */
const RANK_WEIGHT: Record<CardRank, number> = {
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
 * 获取点数比较权重，用于首攻判定和攻防大小比较。
 */
export function getRankWeight(rank: CardRank): number {
    return RANK_WEIGHT[rank];
}

/**
 * 判断指定座位是否为当前轮主攻方。
 */
export function isMainAttackSeat(
    seat: number,
    roleState: RoundRoleState,
): boolean {
    return roleState.attackSeat === seat;
}

/**
 * 判断指定座位是否为当前轮受攻方。
 */
export function isDefenseSeat(
    seat: number,
    roleState: RoundRoleState,
): boolean {
    return roleState.defendSeat === seat;
}

/**
 * 判断指定座位是否具备攻击或追加攻牌权限。
 */
export function isAttackRoleSeat(
    seat: number,
    roleState: RoundRoleState,
): boolean {
    return (
        roleState.attackSeat === seat || roleState.supportSeats.includes(seat)
    );
}

/**
 * 判断守牌是否可以合法压制目标攻牌。
 */
export function canDefendCard(
    attackCard: CardDTO,
    defendCard: CardDTO,
    trumpSuit: CardSuit,
): boolean {
    if (defendCard.isSealCard) {
        if (!attackCard.isSealCard) {
            return true;
        }
        return getRankWeight(defendCard.rank) > getRankWeight(attackCard.rank);
    }
    if (attackCard.isSealCard) {
        return false;
    }
    const attackIsTrump = attackCard.suit === trumpSuit;
    const defendIsTrump = defendCard.suit === trumpSuit;
    if (defendIsTrump && !attackIsTrump) {
        return true;
    }
    if (defendIsTrump !== attackIsTrump) {
        return false;
    }
    if (defendCard.suit !== attackCard.suit && !defendIsTrump) {
        return false;
    }
    return getRankWeight(defendCard.rank) > getRankWeight(attackCard.rank);
}

/**
 * 判断某张牌是否可以作为追加攻牌进入当前桌面。
 */
export function canAddAttackCard(
    card: CardDTO,
    tablePairs: TablePairState[],
    isAttackSealed: boolean,
    sealCardRank?: CardRank,
): boolean {
    if (tablePairs.length === 0) {
        return false;
    }
    if (isAttackSealed) {
        return (
            card.isSealCard &&
            sealCardRank !== undefined &&
            card.rank !== sealCardRank
        );
    }
    const tableRanks = new Set<CardRank>();
    for (const pair of tablePairs) {
        tableRanks.add(pair.attackCard.rank);
        if (pair.defendCard !== undefined) {
            tableRanks.add(pair.defendCard.rank);
        }
    }
    return tableRanks.has(card.rank);
}

/**
 * 判断桌面所有攻牌是否都已经被守牌覆盖。
 */
export function areAllPairsDefended(tablePairs: TablePairState[]): boolean {
    return (
        tablePairs.length > 0 &&
        tablePairs.every((pair) => pair.defendCard !== undefined)
    );
}

/**
 * 统计当前桌面仍未防住的攻牌数量。
 */
export function countUncoveredPairs(tablePairs: TablePairState[]): number {
    return tablePairs.filter((pair) => pair.defendCard === undefined).length;
}

/**
 * 校验所有已放置守牌仍能合法压制对应攻牌。
 */
export function areDefensesValid(
    tablePairs: TablePairState[],
    trumpSuit: CardSuit,
): boolean {
    return tablePairs.every((pair) => {
        if (pair.defendCard === undefined) {
            return true;
        }
        return canDefendCard(pair.attackCard, pair.defendCard, trumpSuit);
    });
}
