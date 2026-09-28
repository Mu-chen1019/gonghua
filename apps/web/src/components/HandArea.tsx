/**
 * 手牌区域组件，负责展示当前玩家可见手牌并同步选牌状态。
 */
import {
    horizontalListSortingStrategy,
    SortableContext,
    useSortable,
} from "@dnd-kit/sortable";
import type { CSSProperties } from "react";
import { AnimatePresence } from "framer-motion";
import type { CardDTO } from "@gonghua/contracts";
import { CardView } from "./CardView";

/**
 * 单张手牌排序组件入参。
 */
interface SortableHandCardProps {
    card: CardDTO; // 当前渲染的手牌。
    selected: boolean; // 当前手牌是否被选中。
    hidden: boolean; // 当前手牌是否作为提交中拖拽牌隐藏占位。
    dragDisabled: boolean; // 是否禁用拖拽排序和拖拽出牌。
    onSelectCard: (cardId: string) => void; // 选择或取消选择手牌的回调。
}

/**
 * 手牌区域组件入参。
 */
interface HandAreaProps {
    cards: CardDTO[]; // 当前玩家可见手牌。
    selectedCardId: string; // 当前选中的卡牌标识。
    selectedCardIds: string[]; // 当前点击多选的卡牌标识列表。
    hiddenCardIds?: string[]; // 需要隐藏但保留占位的手牌标识列表。
    autoSortEnabled: boolean; // 是否开启自动排序。
    onSelectCard: (cardId: string) => void; // 选择或取消选择卡牌的回调。
    onSortByRule: () => void; // 点击一键排序按钮时触发。
    onToggleAutoSort: (enabled: boolean) => void; // 切换自动排序配置时触发。
    dragDisabled?: boolean; // 是否禁用手牌拖拽。
}

/**
 * 渲染当前玩家手牌列表。
 */
export function HandArea({
    cards,
    selectedCardId,
    selectedCardIds,
    hiddenCardIds = [],
    autoSortEnabled,
    onSelectCard,
    onSortByRule,
    onToggleAutoSort,
    dragDisabled = false,
}: HandAreaProps) {
    /** 多选集合优先用于批量攻牌，兼容旧单选字段用于防守动作。 */
    const selectedCardIdSet = new Set(
        selectedCardIds.length > 0 ? selectedCardIds : [selectedCardId],
    );
    /** 拖拽提交期间继续隐藏原手牌，避免服务端响应前闪回原位置。 */
    const hiddenCardIdSet = new Set(hiddenCardIds);
    return (
        <section className="hand-area">
            <div className="hand-toolbar">
                <button
                    type="button"
                    disabled={cards.length <= 1}
                    onClick={onSortByRule}
                >
                    一键排序
                </button>
                <label>
                    <input
                        type="checkbox"
                        checked={autoSortEnabled}
                        onChange={(event) =>
                            onToggleAutoSort(event.currentTarget.checked)
                        }
                    />
                    自动排序
                </label>
            </div>

            <SortableContext
                items={cards.map((card) => `hand-card:${card.id}`)}
                strategy={horizontalListSortingStrategy}
            >
                <div className="hand-card-list">
                    <AnimatePresence>
                        {cards.map((card) => (
                            <SortableHandCard
                                key={card.id}
                                card={card}
                                selected={selectedCardIdSet.has(card.id)}
                                hidden={hiddenCardIdSet.has(card.id)}
                                dragDisabled={dragDisabled}
                                onSelectCard={onSelectCard}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            </SortableContext>
        </section>
    );
}

/**
 * 渲染可在手牌区内排序，也可拖出到桌面区域的单张手牌。
 */
function SortableHandCard({
    card,
    selected,
    hidden,
    dragDisabled,
    onSelectCard,
}: SortableHandCardProps) {
    /** 手牌排序节点，同时携带出牌拖拽所需的业务数据。 */
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: `hand-card:${card.id}`,
        data: {
            dragType: "hand-card",
            cardId: card.id,
            card,
        },
        disabled: dragDisabled,
    });
    /** 拖动中的位移样式，释放后由排序状态或服务端牌局状态统一刷新。 */
    const sortStyle: CSSProperties = {
        transform:
            transform === null
                ? undefined
                : `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        transition,
        visibility: isDragging || hidden ? "hidden" : "visible",
        touchAction: "none",
    };

    return (
        <div
            ref={setNodeRef}
            style={sortStyle}
            className="draggable-card-shell"
            {...listeners}
            {...attributes}
        >
            <CardView
                card={card}
                selected={selected}
                motionDisabled={isDragging || hidden}
                onClick={() => onSelectCard(card.id)}
            />
        </div>
    );
}
