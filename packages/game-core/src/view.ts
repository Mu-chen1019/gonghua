/**
 * 玩家视角映射模块。
 *
 * 本文件以 `createPlayerView` 为入口，把完整 `GameState` 转换成指定玩家可见的 `GameViewStateDTO`。
 * 内部会分别生成玩家列表、角色标识、可操作状态、动作提示和全局状态文案；
 * 它只处理展示裁剪和提示生成，不参与规则判定和状态修改。
 */
import {
    CardDTO,
    GameMode,
    GamePhase,
    GameViewStateDTO,
    PlayerStatus,
    PlayerRole,
    PlayerType,
    PlayerViewDTO,
} from "@gonghua/contracts";
import { GameState, PlayerState } from "./model";
import { getRankWeight } from "./rules";

/**
 * 根据玩家标识创建玩家视角，非当前玩家不会暴露具体手牌。
 */
export function createPlayerView(
    gameState: GameState,
    playerId: string,
): GameViewStateDTO {
    /** 请求视角对应的玩家，不存在时使用首位玩家作为兜底视角。 */
    const localPlayer = gameState.players.find(
        (player) => player.playerId === playerId,
    );
    /** 最终用于生成视角的玩家，必须存在才能安全过滤手牌。 */
    const resolvedPlayer = localPlayer ?? gameState.players[0];
    if (resolvedPlayer === undefined) {
        throw new Error("无法创建玩家视角：对局没有玩家");
    }
    return {
        gameId: gameState.gameId,
        stateVersion: gameState.stateVersion,
        localPlayerId: resolvedPlayer.playerId,
        mode: gameState.config.mode ?? GameMode.NORMAL,
        phase: gameState.phase,
        trumpSuit: gameState.trumpSuit,
        trumpCard: gameState.trumpCard,
        deckCount: gameState.deck.length,
        discardCount: gameState.discardPile.length,
        isNoRefillMode: gameState.isNoRefillMode,
        players: gameState.players.map((player) =>
            createPlayerViewItem(gameState, player, resolvedPlayer.playerId),
        ),
        rankings: gameState.players
            .filter((player) => player.rank !== undefined)
            .map((player) => ({
                playerId: player.playerId,
                seat: player.seat,
                name: player.name,
                rank: player.rank!,
            }))
            .sort((left, right) => left.rank - right.rank),
        tablePairs: gameState.tablePairs.map((pair) => ({ ...pair })),
        roundRoleState: {
            attackSeat: gameState.roundRoleState.attackSeat,
            defendSeat: gameState.roundRoleState.defendSeat,
            supportSeats: gameState.roundRoleState.supportSeats.slice(),
            currentTurnSeat: gameState.roundRoleState.currentTurnSeat,
        },
        roundBattleState: {
            ...gameState.roundBattleState,
            stoppedAttackSeats:
                gameState.roundBattleState.stoppedAttackSeats?.slice() ?? [],
        },
        message: createStateMessage(gameState),
    };
}

/**
 * 创建单个玩家的视角数据，当前玩家和机器人会携带手牌列表。
 */
function createPlayerViewItem(
    gameState: GameState,
    player: PlayerState,
    localPlayerId: string,
): PlayerViewDTO {
    /** 当前条目是否为请求视角对应的玩家。 */
    const isCurrentPlayer = player.playerId === localPlayerId;
    /** 机器人手牌对真人公开，便于单人调试和观察自动出牌决策。 */
    const shouldRevealHandCards = isCurrentPlayer || player.isBot;
    return {
        playerId: player.playerId,
        ...(player.accountId === undefined
            ? {}
            : { accountId: player.accountId }),
        playerType:
            player.playerType ??
            (player.isBot ? PlayerType.BOT : PlayerType.HUMAN),
        ...(player.botProfileId === undefined
            ? {}
            : { botProfileId: player.botProfileId }),
        ...(player.avatarUrl === undefined
            ? {}
            : { avatarUrl: player.avatarUrl }),
        seat: player.seat,
        name: player.name,
        isBot: player.isBot,
        status: player.status,
        role: getPlayerRole(gameState, player.seat),
        handCount: player.handCards.length,
        handCards: shouldRevealHandCards ? player.handCards.slice() : [],
        isCurrentPlayer,
        isCurrentTurn: gameState.roundRoleState.currentTurnSeat === player.seat,
        canAct: canPlayerAct(gameState, player.seat),
        actionHint: createPlayerActionHint(gameState, player.seat),
        ...(player.rank === undefined ? {} : { rank: player.rank }),
    };
}

/**
 * 根据当前轮角色关系解析指定座位的角色。
 */
function getPlayerRole(gameState: GameState, seat: number): PlayerRole {
    if (gameState.roundRoleState.attackSeat === seat) {
        return PlayerRole.MAIN_ATTACK;
    }
    if (gameState.roundRoleState.defendSeat === seat) {
        return PlayerRole.DEFENSE;
    }
    return PlayerRole.SUPPORT;
}

/**
 * 判断指定座位在当前阶段是否存在可提交动作。
 */
function canPlayerAct(gameState: GameState, seat: number): boolean {
    const role = getPlayerRole(gameState, seat);
    const player = gameState.players.find((item) => item.seat === seat);
    if (
        player?.status === PlayerStatus.FINISHED ||
        gameState.phase === GamePhase.GAME_OVER
    ) {
        return false;
    }
    if (gameState.phase === GamePhase.TRUMP_EXCHANGE_READY) {
        return (
            player !== undefined &&
            hasTrumpExchange(player.handCards, gameState.trumpCard)
        );
    }
    if (gameState.phase === GamePhase.FIRST_ATTACK_READY) {
        return (
            role === PlayerRole.MAIN_ATTACK &&
            gameState.roundRoleState.currentTurnSeat === seat
        );
    }
    if (gameState.phase === GamePhase.ROUND_ACTIVE) {
        if (
            role !== PlayerRole.DEFENSE &&
            (gameState.roundBattleState.stoppedAttackSeats ?? []).includes(seat)
        ) {
            return false;
        }
        return (
            role === PlayerRole.DEFENSE ||
            role === PlayerRole.MAIN_ATTACK ||
            role === PlayerRole.SUPPORT
        );
    }
    if (gameState.phase === GamePhase.DEFENSE_COLLECTING) {
        if (role === PlayerRole.DEFENSE) {
            return allAttackStopped(gameState);
        }
        return !isAttackStopped(gameState, seat);
    }
    return false;
}

/**
 * 生成玩家面板上展示的中文操作提示，避免只用高亮颜色表达规则状态。
 */
function createPlayerActionHint(gameState: GameState, seat: number): string {
    const role = getPlayerRole(gameState, seat);
    const player = gameState.players.find((item) => item.seat === seat);
    if (player?.rank !== undefined) {
        return `第${player.rank}名`;
    }
    if (gameState.phase === GamePhase.GAME_OVER) {
        return "已结束";
    }
    if (gameState.phase === GamePhase.TRUMP_EXCHANGE_READY) {
        return player !== undefined &&
            hasTrumpExchange(player.handCards, gameState.trumpCard)
            ? "可换底"
            : "等待换底";
    }
    if (gameState.phase === GamePhase.FIRST_ATTACK_READY) {
        return role === PlayerRole.MAIN_ATTACK ? "等待首攻" : "等待";
    }
    if (gameState.phase === GamePhase.ROUND_ACTIVE) {
        if (role === PlayerRole.DEFENSE) {
            return "可防守";
        }
        if (
            (gameState.roundBattleState.stoppedAttackSeats ?? []).includes(seat)
        ) {
            return "已停攻";
        }
        return "可加攻";
    }
    if (gameState.phase === GamePhase.DEFENSE_COLLECTING) {
        if (role === PlayerRole.DEFENSE) {
            return allAttackStopped(gameState) ? "可收牌" : "等待攻击方停攻";
        }
        if (isAttackStopped(gameState, seat)) {
            return "已停攻";
        }
        return "可加攻";
    }
    if (gameState.phase === GamePhase.WAITING_DEFENSE_REFILL) {
        return role === PlayerRole.DEFENSE ? "待添牌" : "等待";
    }
    return "等待结算";
}

/**
 * 根据状态机阶段生成前端可直接展示的短提示文案。
 */
function createStateMessage(gameState: GameState): string {
    switch (gameState.phase) {
        case GamePhase.TRUMP_EXCHANGE_READY:
            return "有玩家可用更小主牌换底";
        case GamePhase.FIRST_ATTACK_READY:
            return createFirstAttackMessage(gameState);
        case GamePhase.ROUND_ACTIVE:
            return gameState.isNoRefillMode
                ? "只出不添，攻击方可持续加攻或停止进攻，受攻方可防守"
                : "攻防进行中，攻击方可持续加攻或停止进攻，受攻方可防守";
        case GamePhase.DEFENSE_COLLECTING:
            return allAttackStopped(gameState)
                ? "攻击方已全部停攻，受攻方可以确认收牌"
                : "受攻方已放弃防守，攻击方可继续加攻或停止进攻";
        case GamePhase.WAITING_DEFENSE_REFILL:
            return "受攻方空手且仍有未防住牌，等待中途添牌";
        case GamePhase.ROUND_RESULT_READY:
            return "当前轮结果已形成，等待后续结算";
        case GamePhase.GAME_OVER:
            return "对局已结束，排名已生成";
        default:
            return "对局状态已更新";
    }
}

/**
 * 生成首攻准备阶段的状态文案，明确展示谁主攻、谁受攻。
 */
function createFirstAttackMessage(gameState: GameState): string {
    const attacker = gameState.players.find(
        (player) => player.seat === gameState.roundRoleState.attackSeat,
    );
    const defender = gameState.players.find(
        (player) => player.seat === gameState.roundRoleState.defendSeat,
    );
    const prefix = gameState.isNoRefillMode ? "只出不添，" : "";
    return `${prefix}${attacker?.name ?? "首攻方"} 首攻，${defender?.name ?? "受攻方"} 受攻`;
}

/**
 * 判断玩家是否持有可换底主牌。
 */
function hasTrumpExchange(handCards: CardDTO[], trumpCard: CardDTO): boolean {
    return handCards.some(
        (card) =>
            !card.isSealCard &&
            card.suit === trumpCard.suit &&
            getRankWeight(card.rank) < getRankWeight(trumpCard.rank),
    );
}

/**
 * 判断指定攻击方是否已经声明停止进攻。
 */
function isAttackStopped(gameState: GameState, seat: number): boolean {
    return gameState.roundBattleState.stoppedAttackSeats.includes(seat);
}

/**
 * 判断当前轮主攻方和所有助攻方是否都已经停止进攻。
 */
function allAttackStopped(gameState: GameState): boolean {
    const attackRoleSeats = [
        gameState.roundRoleState.attackSeat,
        ...gameState.roundRoleState.supportSeats,
    ];
    return attackRoleSeats.every((seat) => {
        const player = gameState.players.find((item) => item.seat === seat);
        return (
            player?.status === PlayerStatus.FINISHED ||
            isAttackStopped(gameState, seat)
        );
    });
}
