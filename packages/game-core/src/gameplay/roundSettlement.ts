/**
 * 轮结算模块。
 *
 * 本文件处理一轮结束后的状态收口：`settleRound` 根据受攻成功或失败分配桌面牌、补牌并生成下一轮角色；
 * `finalizeNoRefill` 在只出不添阶段给出完手牌的玩家排名，`getFinishRoundResult` 根据新完成玩家判断是否要立即形成轮结果。
 * 它只在轮结果明确后修改轮级状态，轮内是否达到结果由 `gameProgress` 决定。
 */
import {
    CardDTO,
    GameEventDTO,
    GameEventType,
    GamePhase,
    PlayerStatus,
    RoundResult,
} from "@gonghua/contracts";
import { GameState, PlayerState, RoundRoleState } from "../model";
import { countUncoveredPairs } from "../rules";

/**
 * 根据本轮结果处理桌面牌归属、轮后补牌和下一轮角色。
 */
export function settleRound(
    gameState: GameState,
    roundResult: RoundResult.DEFENSE_SUCCESS | RoundResult.DEFENSE_FAILED,
    events: GameEventDTO[],
): GameState {
    /** 结算前的角色关系用于计算补牌顺序和下轮轮转。 */
    const previousRoleState = { ...gameState.roundRoleState };
    /** 桌面所有牌会根据胜负进入弃牌区或受攻方手牌。 */
    const tableCards = collectPairCards(gameState.tablePairs);
    if (roundResult === RoundResult.DEFENSE_SUCCESS) {
        gameState.discardPile.push(...tableCards);
        events.push({
            type: GameEventType.TABLE_CARDS_DISCARDED,
            message: `系统 弃置 桌面牌：${tableCards.length} 张`,
        });
    } else {
        const defender = findPlayerBySeat(
            gameState.players,
            previousRoleState.defendSeat,
        );
        defender.handCards.push(...tableCards);
        events.push({
            type: GameEventType.TABLE_CARDS_COLLECTED,
            playerId: defender.playerId,
            message: `${defender.name} 收取 桌面牌：${tableCards.length} 张`,
        });
    }
    gameState.tablePairs = [];

    /** 轮后补牌统一从本轮主攻方开始，再顺时针补到常规手牌上限。 */
    const refillCount = refillAfterRound(
        gameState,
        previousRoleState.attackSeat,
    );
    events.push({
        type: GameEventType.ROUND_CARDS_REFILLED,
        message: `系统 补齐 轮后手牌：${refillCount} 张`,
    });
    finalizeNoRefill(gameState, events);
    if (gameState.phase === GamePhase.GAME_OVER) {
        return gameState;
    }

    /** 下一轮角色根据本轮胜负重新计算，并重置轮内战斗状态。 */
    gameState.roundRoleState = createNextRoles(
        gameState.players,
        previousRoleState,
        roundResult,
    );
    gameState.roundBattleState = {
        isAttackSealed: false,
        stoppedAttackSeats: [],
        roundResult: RoundResult.NONE,
    };
    gameState.phase = GamePhase.FIRST_ATTACK_READY;
    const nextAttacker = findPlayerBySeat(
        gameState.players,
        gameState.roundRoleState.attackSeat,
    );
    events.push({
        type: GameEventType.NEXT_ROUND_READY,
        playerId: nextAttacker.playerId,
        message: `系统 指定 下轮首攻方：${nextAttacker.name}`,
    });
    return gameState;
}

/**
 * 统一处理只出不添、出完牌排名和对局结束。
 */
export function finalizeNoRefill(
    gameState: GameState,
    events: GameEventDTO[],
): number[] {
    if (!gameState.isNoRefillMode && gameState.deck.length === 0) {
        gameState.isNoRefillMode = true;
        events.push({
            type: GameEventType.NO_REFILL_STARTED,
            message: "系统 进入 只出不添",
        });
    }
    if (!gameState.isNoRefillMode) {
        return [];
    }
    const finishedSeats = rankFinishedPlayers(gameState, events);
    if (getFinishRoundResult(gameState, finishedSeats) !== undefined) {
        return finishedSeats;
    }
    finishIfLastActive(gameState, events);
    return finishedSeats;
}

/**
 * 根据本次新完成玩家的当前轮角色，判断是否需要立即收口本轮。
 */
export function getFinishRoundResult(
    gameState: GameState,
    finishedSeats: number[],
): RoundResult.DEFENSE_SUCCESS | RoundResult.DEFENSE_FAILED | undefined {
    if (
        gameState.phase !== GamePhase.ROUND_ACTIVE &&
        gameState.phase !== GamePhase.DEFENSE_COLLECTING
    ) {
        return undefined;
    }
    if (finishedSeats.includes(gameState.roundRoleState.defendSeat)) {
        return RoundResult.DEFENSE_SUCCESS;
    }
    /** 攻击方出完手牌只记录名次并退出后续操作，不直接判定受攻失败。 */
    return undefined;
}

/**
 * 收集桌面所有攻守牌，保持每组攻牌在前、守牌在后的稳定顺序。
 */
function collectPairCards(tablePairs: GameState["tablePairs"]): CardDTO[] {
    return tablePairs.flatMap((pair) =>
        pair.defendCard === undefined
            ? [pair.attackCard]
            : [pair.attackCard, pair.defendCard],
    );
}

/**
 * 按轮后补牌顺序给玩家补到常规手牌上限。
 */
function refillAfterRound(gameState: GameState, attackSeat: number): number {
    if (gameState.isNoRefillMode) {
        return 0;
    }
    /** 补牌顺序为本轮主攻方优先，随后从主攻方下家开始顺时针。 */
    const refillSeats = createSeatOrder(gameState.players.length, attackSeat);
    let refillCount = 0;
    for (const seat of refillSeats) {
        const player = findPlayerBySeat(gameState.players, seat);
        while (
            player.handCards.length < gameState.config.initialHandSize &&
            gameState.deck.length > 0
        ) {
            const card = gameState.deck.shift();
            if (card === undefined) {
                break;
            }
            player.handCards.push(card);
            refillCount += 1;
        }
    }
    return refillCount;
}

/**
 * 只出不添阶段记录所有已经出完手牌的玩家名次。
 */
function rankFinishedPlayers(
    gameState: GameState,
    events: GameEventDTO[],
): number[] {
    let nextRank = getNextRank(gameState.players);
    /** 本次检查中新登记完成的玩家座位。 */
    const finishedSeats: number[] = [];
    for (const player of gameState.players) {
        if (
            player.status === PlayerStatus.ACTIVE &&
            player.handCards.length === 0 &&
            canRankPlayer(gameState, player)
        ) {
            player.status = PlayerStatus.FINISHED;
            player.rank = nextRank;
            events.push({
                type: GameEventType.PLAYER_FINISHED,
                playerId: player.playerId,
                message: `${player.name} 完成 第${nextRank}名`,
            });
            finishedSeats.push(player.seat);
            nextRank += 1;
        }
    }
    return finishedSeats;
}

/**
 * 判断玩家当前是否可以登记名次，受攻方无牌可补时打空手牌即完成。
 */
function canRankPlayer(gameState: GameState, player: PlayerState): boolean {
    const isCurrentDefender =
        player.seat === gameState.roundRoleState.defendSeat;
    if (!isCurrentDefender) {
        return true;
    }
    const hasUncoveredTableCards =
        countUncoveredPairs(gameState.tablePairs) > 0;
    if (!hasUncoveredTableCards) {
        return true;
    }
    if (gameState.phase === GamePhase.DEFENSE_COLLECTING) {
        return false;
    }
    if (gameState.phase === GamePhase.ROUND_ACTIVE) {
        return gameState.isNoRefillMode;
    }
    return true;
}

/**
 * 计算下一位完成玩家应获得的名次。
 */
function getNextRank(players: PlayerState[]): number {
    return (
        players.reduce(
            (maxRank, player) =>
                player.rank === undefined
                    ? maxRank
                    : Math.max(maxRank, player.rank),
            0,
        ) + 1
    );
}

/**
 * 当只剩一名未完成玩家时，记录最后一名并结束对局。
 */
function finishIfLastActive(
    gameState: GameState,
    events: GameEventDTO[],
): void {
    const activePlayers = gameState.players.filter(
        (player) => player.status === PlayerStatus.ACTIVE,
    );
    if (activePlayers.length > 1) {
        return;
    }
    const lastPlayer = activePlayers[0];
    if (lastPlayer !== undefined) {
        const rank = getNextRank(gameState.players);
        lastPlayer.status = PlayerStatus.FINISHED;
        lastPlayer.rank = rank;
        events.push({
            type: GameEventType.PLAYER_FINISHED,
            playerId: lastPlayer.playerId,
            message: `${lastPlayer.name} 完成 第${rank}名`,
        });
    }
    gameState.phase = GamePhase.GAME_OVER;
    events.push({
        type: GameEventType.GAME_OVER,
        message: "系统 结束 对局",
    });
}

/**
 * 创建从指定座位开始的顺时针座位列表。
 */
function createSeatOrder(playerCount: number, startSeat: number): number[] {
    return Array.from(
        { length: playerCount },
        (_, index) => (startSeat + index) % playerCount,
    );
}

/**
 * 根据本轮胜负创建下一轮角色关系。
 */
function createNextRoles(
    players: PlayerState[],
    previousRoleState: RoundRoleState,
    roundResult: RoundResult.DEFENSE_SUCCESS | RoundResult.DEFENSE_FAILED,
): RoundRoleState {
    /** 受攻成功时受攻方成为新主攻；受攻失败时原主攻继续保留进攻权。 */
    const preferredAttackSeat =
        roundResult === RoundResult.DEFENSE_SUCCESS
            ? previousRoleState.defendSeat
            : previousRoleState.attackSeat;
    const attackSeat = findNextActiveSeat(players, preferredAttackSeat);
    /** 受攻失败时攻击上轮受攻方下家，若冲突则回退为新主攻下家。 */
    const preferredDefendSeat =
        roundResult === RoundResult.DEFENSE_SUCCESS
            ? (attackSeat + 1) % players.length
            : (previousRoleState.defendSeat + 1) % players.length;
    const defendSeat = findNextActiveSeat(
        players,
        preferredDefendSeat === attackSeat
            ? (attackSeat + 1) % players.length
            : preferredDefendSeat,
        attackSeat,
    );
    const supportSeats = players
        .filter((player) => player.status === PlayerStatus.ACTIVE)
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
 * 从指定座位开始顺时针查找仍在对局中的玩家座位。
 */
function findNextActiveSeat(
    players: PlayerState[],
    startSeat: number,
    excludedSeat?: number,
): number {
    for (let offset = 0; offset < players.length; offset += 1) {
        const seat = (startSeat + offset) % players.length;
        const player = players.find((item) => item.seat === seat);
        if (
            player?.status === PlayerStatus.ACTIVE &&
            player.seat !== excludedSeat
        ) {
            return player.seat;
        }
    }
    throw new Error("无法找到仍在对局中的玩家座位");
}

/**
 * 根据座位查找玩家；状态异常时抛出错误以暴露调用方问题。
 */
function findPlayerBySeat(players: PlayerState[], seat: number): PlayerState {
    const player = players.find((item) => item.seat === seat);
    if (player === undefined) {
        throw new Error(`找不到座位 ${seat} 的玩家`);
    }
    return player;
}
