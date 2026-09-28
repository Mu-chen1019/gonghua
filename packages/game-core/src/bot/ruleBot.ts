/**
 * 默认规则机器人模块。
 *
 * 本文件承接原 `bot.ts` 的实际策略逻辑：`findNextBotActor` 负责按阶段找出下一个需要自动行动的机器人，
 * `selectBotAction` 负责基于 `getLegalActions` 和最小牌优先规则选择动作。
 * 选牌细节下沉到 `cardPicker`，策略接口沉淀在 `types`，执行动作仍由 `gameplay/botStep` 回到统一状态机入口。
 */
import {
    CardDTO,
    GameActionDTO,
    GameActionType,
    GamePhase,
    PlayerStatus,
} from "@gonghua/contracts";
import { getLegalActions } from "../legalActions";
import type { GameState, PlayerState } from "../model";
import {
    areAllPairsDefended,
    getRankWeight,
    isDefenseSeat,
    isMainAttackSeat,
} from "../rules";
import {
    pickLowestAttackAction,
    pickLowestDefenseAction,
    sortCardsByPower,
} from "./cardPicker";
import type { BotStrategy } from "./types";

/**
 * 当前默认规则机器人策略，后续机器人分级会从这里扩展或组合。
 */
export const ruleBotStrategy: BotStrategy = {
    selectAction: selectRuleBotAction,
};

/**
 * 查找当前阶段需要自动行动的机器人玩家。
 */
export function findNextBotActor(
    gameState: GameState,
): PlayerState | undefined {
    if (gameState.phase === GamePhase.GAME_OVER) {
        return undefined;
    }
    const exchangeBot = gameState.players.find(
        (player) =>
            isActiveBot(player) &&
            findExchangeCard(player.handCards, gameState) !== undefined,
    );
    if (exchangeBot !== undefined) {
        return exchangeBot;
    }
    if (gameState.phase === GamePhase.FIRST_ATTACK_READY) {
        const attacker = gameState.players.find(
            (player) =>
                player.seat === gameState.roundRoleState.currentTurnSeat &&
                isMainAttackSeat(player.seat, gameState.roundRoleState),
        );
        return attacker !== undefined && isActiveBot(attacker)
            ? attacker
            : undefined;
    }
    if (gameState.phase === GamePhase.ROUND_ACTIVE) {
        const defender = gameState.players.find((player) =>
            isDefenseSeat(player.seat, gameState.roundRoleState),
        );
        if (
            defender !== undefined &&
            isActiveBot(defender) &&
            hasUncoveredPair(gameState)
        ) {
            return defender;
        }
        return findNextAttackBot(gameState);
    }
    if (gameState.phase === GamePhase.DEFENSE_COLLECTING) {
        const attackBot = findNextAttackBot(gameState);
        if (attackBot !== undefined) {
            return attackBot;
        }
        const defender = gameState.players.find((player) =>
            isDefenseSeat(player.seat, gameState.roundRoleState),
        );
        return defender !== undefined && isActiveBot(defender)
            ? defender
            : undefined;
    }
    return undefined;
}

/**
 * 根据机器人当前角色和阶段，从合法动作列表中选择一个动作。
 */
export function selectBotAction(
    gameState: GameState,
    botPlayer: PlayerState,
): GameActionDTO | undefined {
    return ruleBotStrategy.selectAction(gameState, botPlayer);
}

/**
 * 默认规则机器人根据合法动作选择具体动作。
 */
function selectRuleBotAction(
    gameState: GameState,
    botPlayer: PlayerState,
): GameActionDTO | undefined {
    if (!isActiveBot(botPlayer)) {
        return undefined;
    }
    const legalActions = getLegalActions(gameState, botPlayer.playerId);
    if (legalActions.length === 0) {
        return undefined;
    }
    return selectPreferredBotAction(botPlayer, legalActions);
}

/**
 * 选择机器人在合法动作中的优先动作，仍保持最小牌和尽快推进的策略。
 */
function selectPreferredBotAction(
    botPlayer: PlayerState,
    legalActions: GameActionDTO[],
): GameActionDTO | undefined {
    const attackAction = pickLowestAttackAction(botPlayer, legalActions);
    if (attackAction !== undefined) {
        return attackAction;
    }
    const defenseAction = pickLowestDefenseAction(botPlayer, legalActions);
    if (defenseAction !== undefined) {
        return defenseAction;
    }
    const stopAction = legalActions.find(
        (action) => action.actionType === GameActionType.STOP_ATTACK,
    );
    if (stopAction !== undefined) {
        return stopAction;
    }
    const collectAction = legalActions.find(
        (action) => action.actionType === GameActionType.COLLECT_TABLE_CARDS,
    );
    if (collectAction !== undefined) {
        return collectAction;
    }
    const giveUpAction = legalActions.find(
        (action) => action.actionType === GameActionType.GIVE_UP_DEFENSE,
    );
    if (giveUpAction !== undefined) {
        return giveUpAction;
    }
    const exchangeAction = legalActions.find(
        (action) => action.actionType === GameActionType.EXCHANGE_TRUMP_CARD,
    );
    return exchangeAction ?? legalActions[0];
}

/**
 * 查找尚未停攻且仍可由系统自动处理的攻击机器人。
 */
function findNextAttackBot(gameState: GameState): PlayerState | undefined {
    const attackSeats = [
        gameState.roundRoleState.attackSeat,
        ...gameState.roundRoleState.supportSeats,
    ];
    return attackSeats
        .map((seat) => gameState.players.find((player) => player.seat === seat))
        .find(
            (player): player is PlayerState =>
                player !== undefined &&
                isActiveBot(player) &&
                !isAttackStopped(gameState, player.seat) &&
                selectAttackAction(gameState, player) !== undefined,
        );
}

/**
 * 根据合法动作判断攻击机器人是否仍有可自动推进动作。
 */
function selectAttackAction(
    gameState: GameState,
    botPlayer: PlayerState,
): GameActionDTO | undefined {
    const legalActions = getLegalActions(gameState, botPlayer.playerId).filter(
        (action) =>
            action.actionType === GameActionType.PLAY_ATTACK_CARD ||
            action.actionType === GameActionType.STOP_ATTACK,
    );
    if (legalActions.length === 0) {
        return undefined;
    }
    if (
        gameState.phase === GamePhase.ROUND_ACTIVE &&
        !areAllPairsDefended(gameState.tablePairs) &&
        !legalActions.some(
            (action) => action.actionType === GameActionType.PLAY_ATTACK_CARD,
        )
    ) {
        return undefined;
    }
    return selectPreferredBotAction(botPlayer, legalActions);
}

/**
 * 判断玩家是否为仍可自动行动的机器人。
 */
function isActiveBot(player: PlayerState): boolean {
    return player.isBot && player.status === PlayerStatus.ACTIVE;
}

/**
 * 查找机器人可用于换底的最小主牌。
 */
function findExchangeCard(
    handCards: CardDTO[],
    gameState: GameState,
): CardDTO | undefined {
    /** 牌堆耗尽后没有可交换底牌，不能继续基于旧 trumpCard 触发机器人换底。 */
    const deckBottomCard = gameState.deck[gameState.deck.length - 1];
    if (deckBottomCard === undefined) {
        return undefined;
    }
    return sortCardsByPower(handCards).find(
        (card) =>
            !card.isSealCard &&
            card.suit === deckBottomCard.suit &&
            getRankWeight(card.rank) < getRankWeight(deckBottomCard.rank),
    );
}

/**
 * 判断指定攻击方是否已经停止进攻。
 */
function isAttackStopped(gameState: GameState, seat: number): boolean {
    return gameState.roundBattleState.stoppedAttackSeats.includes(seat);
}

/**
 * 判断桌面是否仍有未被守牌覆盖的攻牌。
 */
function hasUncoveredPair(gameState: GameState): boolean {
    return !areAllPairsDefended(gameState.tablePairs);
}
