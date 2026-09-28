/**
 * 卡牌展示组件，负责呈现单张牌的牌面、主牌标记和选中态。
 */
import type { CSSProperties } from "react";
import { useDraggable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { CardRank, CardSuit } from "@gonghua/contracts";
import type { CardDTO } from "@gonghua/contracts";

/**
 * 手牌拖拽数据，表示玩家把手牌拖向桌面或具体牌位。
 */
export interface HandCardDragPayload {
    dragType: "hand-card"; // 拖拽来源为当前玩家手牌。
    cardId: string; // 被拖动的手牌标识。
    card: CardDTO; // 被拖动的卡牌牌面数据。
}

/**
 * 守牌拖拽数据，表示玩家把已经出的守牌移动到其他牌位。
 */
export interface DefenseCardDragPayload {
    dragType: "defense-card"; // 拖拽来源为桌面守牌。
    cardId: string; // 被拖动的守牌标识。
    sourcePairId: string; // 被拖动守牌原本所在的牌位标识。
    card: CardDTO; // 被拖动的卡牌牌面数据。
}

/**
 * 卡牌拖拽数据联合类型，覆盖当前牌局里允许拖动的卡牌来源。
 */
export type CardDragPayload = HandCardDragPayload | DefenseCardDragPayload;

/**
 * 卡牌展示组件入参。
 */
interface CardViewProps {
    card: CardDTO; // 需要展示的卡牌数据。
    selected?: boolean; // 是否处于选中状态。
    compact?: boolean; // 是否使用桌面牌位中的紧凑样式。
    motionDisabled?: boolean; // 是否关闭卡牌自身位移和点击动效。
    onClick?: () => void; // 点击卡牌时触发的回调。
}

/**
 * 可拖拽卡牌展示组件入参。
 */
interface DraggableCardViewProps extends CardViewProps {
    dragId: string; // 当前拖拽节点的唯一标识。
    dragPayload: CardDragPayload; // 拖拽结束后用于转换动作的业务数据。
    disabled?: boolean; // 是否禁用拖拽能力。
}

/** 卡牌点数展示文案，数字和字母放在左上角。 */
const rankText: Record<CardRank, string> = {
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

/** 卡牌花色展示文案，普通花色保持在卡牌原来的居中位置。 */
const suitText: Record<CardSuit, string> = {
    [CardSuit.HEART]: "红桃",
    [CardSuit.DIAMOND]: "方块",
    [CardSuit.SPADE]: "黑桃",
    [CardSuit.CLUB]: "梅花",
    [CardSuit.NONE]: "",
};

/**
 * 渲染单张可交互卡牌。
 */
export function CardView({
    card,
    selected = false,
    compact = false,
    motionDisabled = false,
    onClick,
}: CardViewProps) {
    /** 红色花色用于切换牌面颜色，大小王和黑色花色走默认深色。 */
    const isRed = card.suit === "heart" || card.suit === "diamond";
    /** 普通牌在中间展示花色，大小王只展示左上角牌面。 */
    const suitLabel = suitText[card.suit];
    /** 拖拽浮层和原占位节点关闭内部动画，避免和 dnd-kit 位移叠加。 */
    const motionProps = motionDisabled
        ? { layout: false }
        : {
              layout: true,
              animate: { y: selected && !compact ? -8 : 0 },
              whileHover: { y: compact ? -2 : -8 },
              whileTap: { scale: 0.96 },
          };
    return (
        <motion.button
            type="button"
            {...motionProps}
            onClick={onClick}
            className={`card-view ${compact ? "card-view-compact" : ""} ${selected ? "card-view-selected" : ""}`}
        >
            <span
                className={`card-view-rank ${isRed ? "text-rose-600" : "text-slate-900"}`}
            >
                {rankText[card.rank]}
            </span>
            {suitLabel.length > 0 ? (
                <span
                    className={`card-view-suit ${isRed ? "text-rose-600" : "text-slate-900"}`}
                >
                    {suitLabel}
                </span>
            ) : null}
            {card.isTrump ? <small>主</small> : null}
        </motion.button>
    );
}

/**
 * 渲染带拖拽能力的卡牌，拖拽本身只传递意图，不直接修改牌局状态。
 */
export function DraggableCardView({
    dragId,
    dragPayload,
    disabled = false,
    card,
    selected = false,
    compact = false,
    onClick,
}: DraggableCardViewProps) {
    /** 拖拽节点绑定信息，位移样式只作用在外层，避免和卡牌动画互相覆盖。 */
    const { attributes, listeners, setNodeRef, transform, isDragging } =
        useDraggable({
            id: dragId,
            data: dragPayload,
            disabled,
        });
    /** 拖动过程中的临时位移样式，释放后由服务端权威状态刷新牌面。 */
    const dragStyle: CSSProperties = {
        transform:
            transform === null
                ? undefined
                : `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        visibility: isDragging ? "hidden" : "visible",
        touchAction: "none",
    };

    return (
        <div
            ref={setNodeRef}
            style={dragStyle}
            className="draggable-card-shell"
            {...listeners}
            {...attributes}
        >
            <CardView
                card={card}
                selected={selected}
                compact={compact}
                motionDisabled={isDragging}
                {...(onClick === undefined ? {} : { onClick })}
            />
        </div>
    );
}
