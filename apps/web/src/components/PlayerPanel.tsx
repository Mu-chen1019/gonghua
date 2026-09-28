/**
 * 玩家信息面板组件，负责展示座位、角色、手牌数量和当前行动态。
 */
import { PlayerStatus } from "@gonghua/contracts";
import type { CardSuit } from "@gonghua/contracts";
import type { PlayerViewDTO } from "@gonghua/contracts";
import { sortCardsByRule } from "../utils/cardSort";
import { CardView } from "./CardView";

/**
 * 玩家信息面板组件入参。
 */
interface PlayerPanelProps {
    player: PlayerViewDTO; // 当前需要展示的玩家视角数据。
    trumpSuit: CardSuit; // 当前主花色，用于机器人手牌展示排序。
}

/** 玩家角色中文文案映射，用于面板中的短标签展示。 */
const roleText = {
    main_attack: "主攻",
    defense: "受攻",
    support: "助攻",
};

/**
 * 渲染单个玩家的对局摘要信息。
 */
export function PlayerPanel({ player, trumpSuit }: PlayerPanelProps) {
    /** 停止进攻等非可操作状态也需要展示，避免玩家状态不透明。 */
    const shouldShowActionHint =
        player.canAct ||
        player.actionHint === "已停攻" ||
        player.status === PlayerStatus.FINISHED;
    /** 已完成玩家保留在座位区展示，用名次说明该玩家已离开后续轮转。 */
    const finishedClassName =
        player.status === PlayerStatus.FINISHED ? " player-panel-finished" : "";
    /** 机器人手牌默认使用一键排序规则，便于观察自动出牌决策。 */
    const botHandCards = player.isBot
        ? sortCardsByRule(player.handCards, trumpSuit)
        : [];
    return (
        <section
            className={`player-panel ${player.canAct ? "player-panel-actionable" : ""}${finishedClassName}`}
        >
            <div className="player-panel-main">
                <div className="player-panel-identity">
                    <div className="player-seat-badge">{player.seat + 1}</div>
                    <div className="player-panel-text">
                        <p className="player-name">{player.name}</p>
                        <p className="player-meta">
                            {roleText[player.role]} · {player.handCount} 张
                            {player.isBot ? " · 机器人" : ""}
                        </p>
                    </div>
                </div>

                {botHandCards.length > 0 ? (
                    <div className="bot-hand-card-list">
                        {botHandCards.map((card) => (
                            <div className="bot-hand-card" key={card.id}>
                                <CardView card={card} compact />
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>

            <div className="player-panel-tags">
                {shouldShowActionHint ? (
                    <span className="player-panel-action-hint">
                        {player.actionHint}
                    </span>
                ) : null}
                {player.isCurrentPlayer ? (
                    <span className="player-panel-self">本人</span>
                ) : null}
            </div>
        </section>
    );
}
