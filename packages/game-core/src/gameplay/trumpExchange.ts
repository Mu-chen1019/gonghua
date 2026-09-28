/**
 * 换底动作模块。
 *
 * 本文件只处理 `exchangeTrumpCard` 的状态修改：找到玩家最小可换主牌、交换牌堆底牌、重新标记主牌，
 * 不改变已经指定的首攻、受攻和当前行动座位。可换底牌的纯判断放在 `trumpRules`，本模块执行成功后
 * 仍通过 `createProgressResult` 做统一守恒校验。
 */
import { GameErrorCode, GameEventDTO, GameEventType } from "@gonghua/contracts";
import { markTrumpCards } from "../deck";
import { logGameAction } from "../logger";
import { GameOperationResult, GameState, PlayerState } from "../model";
import {
    cloneGameState,
    createFailure,
    findPlayerBySeat,
    removeCardFromHand,
} from "./stateUtils";
import { createProgressResult } from "./gameProgress";
import { findExchangeCard } from "./trumpRules";

/**
 * 处理玩家用手中最小可换主牌与牌堆底部主牌交换的动作。
 */
export function exchangeTrumpCard(
    gameState: GameState,
    actor: PlayerState,
): GameOperationResult {
    /** 可换底牌必须是小于牌堆底部主牌的同主花色普通牌。 */
    const exchangeCard = findExchangeCard(actor.handCards, gameState.trumpCard);
    if (exchangeCard === undefined) {
        return createFailure(
            GameErrorCode.CARD_NOT_IN_HAND,
            "当前玩家没有可换底的主牌",
        );
    }

    /** 换底在副本中完成，避免失败时污染原状态。 */
    const nextState = cloneGameState(gameState);
    const nextActor = findPlayerBySeat(nextState.players, actor.seat);
    const deckBottomCard = nextState.deck[nextState.deck.length - 1];
    if (deckBottomCard === undefined) {
        return createFailure(
            GameErrorCode.STATE_INCONSISTENT,
            "牌堆底牌不存在",
        );
    }
    const removedCard = removeCardFromHand(nextActor, exchangeCard.id);
    if (removedCard === undefined) {
        return createFailure(
            GameErrorCode.CARD_NOT_IN_HAND,
            "当前玩家没有可换底的主牌",
        );
    }
    nextActor.handCards.push(deckBottomCard);
    nextState.deck[nextState.deck.length - 1] = removedCard;
    nextState.trumpCard = removedCard;
    nextState.players = nextState.players.map((player) => ({
        ...player,
        handCards: markTrumpCards(player.handCards, nextState.trumpSuit),
    }));
    nextState.deck = markTrumpCards(nextState.deck, nextState.trumpSuit);
    nextState.trumpCard = nextState.deck[nextState.deck.length - 1]!;
    logGameAction("game", "exchange_trump_card", {
        gameId: nextState.gameId,
        playerId: actor.playerId,
        cardLabel: removedCard.label,
        trumpCard: deckBottomCard.label,
    });
    const events: GameEventDTO[] = [
        {
            type: GameEventType.TRUMP_CARD_EXCHANGED,
            playerId: actor.playerId,
            cardId: removedCard.id,
            message: `${actor.name} 交换 底牌：${removedCard.label} 换 ${deckBottomCard.label}`,
        },
    ];
    return createProgressResult(nextState, events);
}
