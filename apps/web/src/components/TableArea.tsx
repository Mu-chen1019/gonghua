/**
 * 桌面攻守区域组件，负责展示当前轮所有攻守牌位并处理牌位选择。
 */
import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import type { TablePairDTO } from "@gonghua/contracts";
import { CardView, DraggableCardView } from "./CardView";

/**
 * 桌面整体投放区标识，用于识别手牌拖到牌桌空白处的出攻牌意图。
 */
export const TABLE_DROP_ZONE_ID = "table-drop-zone";

/**
 * 牌位投放区数据，表示当前落点对应的桌面攻守牌位。
 */
export interface PairDropPayload {
    dropType: "pair-slot"; // 投放区域类型为具体牌位。
    pairId: string; // 投放区域对应的牌位标识。
}

/**
 * 桌面区域组件入参。
 */
interface TableAreaProps {
    pairs: TablePairDTO[]; // 当前桌面攻守牌位列表。
    selectedPairId: string; // 当前选中的桌面牌位标识。
    onSelectPair: (pairId: string) => void; // 选择或取消选择牌位的回调。
    dragDisabled?: boolean; // 是否禁用桌面守牌拖拽。
}

/**
 * 单个桌面牌位组件入参。
 */
interface PairSlotProps {
    pair: TablePairDTO; // 当前攻守牌位数据。
    selected: boolean; // 当前牌位是否被点击选中。
    dragDisabled: boolean; // 是否禁用守牌拖拽。
    onSelectPair: (pairId: string) => void; // 选择或取消选择牌位的回调。
}

/**
 * 渲染桌面牌位列表和空桌面提示。
 */
export function TableArea({
    pairs,
    selectedPairId,
    onSelectPair,
    dragDisabled = false,
}: TableAreaProps) {
    /** 桌面整体投放区用于承接攻击方从手牌拖出的攻牌。 */
    const { setNodeRef, isOver } = useDroppable({
        id: TABLE_DROP_ZONE_ID,
        data: { dropType: "table" },
    });

    return (
        <section
            ref={setNodeRef}
            className={`table-area ${isOver ? "table-area-over" : ""}`}
        >
            <AnimatePresence>
                {pairs.length === 0 ? (
                    <motion.div
                        className="table-empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                    >
                        等待首张攻牌
                    </motion.div>
                ) : (
                    pairs.map((pair) => (
                        <PairSlot
                            key={pair.pairId}
                            pair={pair}
                            selected={selectedPairId === pair.pairId}
                            dragDisabled={dragDisabled}
                            onSelectPair={onSelectPair}
                        />
                    ))
                )}
            </AnimatePresence>
        </section>
    );
}

/**
 * 渲染单个攻守牌位，并把该牌位注册为守牌投放目标。
 */
function PairSlot({
    pair,
    selected,
    dragDisabled,
    onSelectPair,
}: PairSlotProps) {
    /** 牌位投放区用于承接出守牌和移动守牌动作。 */
    const { setNodeRef, isOver } = useDroppable({
        id: `pair-slot:${pair.pairId}`,
        data: {
            dropType: "pair-slot",
            pairId: pair.pairId,
        } satisfies PairDropPayload,
    });

    return (
        <motion.div
            ref={setNodeRef}
            role="button"
            tabIndex={0}
            layout
            initial={{ opacity: 0, scale: 0.88, y: -24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88 }}
            onClick={() => onSelectPair(pair.pairId)}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    onSelectPair(pair.pairId);
                }
            }}
            className={`pair-slot ${selected ? "pair-slot-selected" : ""} ${isOver ? "pair-slot-over" : ""}`}
        >
            <CardView card={pair.attackCard} />
            {pair.defendCard === undefined ? (
                <div className="defense-placeholder">待防守</div>
            ) : (
                <DraggableCardView
                    dragId={`defense-card:${pair.pairId}:${pair.defendCard.id}`}
                    dragPayload={{
                        dragType: "defense-card",
                        cardId: pair.defendCard.id,
                        sourcePairId: pair.pairId,
                        card: pair.defendCard,
                    }}
                    card={pair.defendCard}
                    disabled={dragDisabled}
                />
            )}
        </motion.div>
    );
}
