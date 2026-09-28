/**
 * 对局页 UI 状态仓库，只保存本地选择和事件提示，不保存完整对局状态。
 */
import { create } from "zustand";
import type { GameEventDTO } from "@gonghua/contracts";
import { logWebGameAction } from "../utils/gameLogger";

/**
 * 对局页本地 UI 状态结构。
 */
interface GameUiState {
    selectedCardId: string; // 当前选中的手牌标识。
    selectedCardIds: string[]; // 当前点击多选的手牌标识列表。
    selectedPairId: string; // 当前选中的桌面牌位标识。
    handOrderByPlayer: Record<string, string[]>; // 每个玩家本地保存的手牌展示顺序。
    autoSortEnabled: boolean; // 是否在手牌变化时自动按规则排序。
    events: GameEventDTO[]; // 最近一次对局动作产生的事件。
    eventHistory: GameEventDTO[]; // 当前页面最近对局事件流水。
    noticeMessage: string; // 当前非阻塞提醒文案。
    selectCard: (cardId: string) => void; // 选择或取消选择手牌。
    selectPair: (pairId: string) => void; // 选择或取消选择桌面牌位。
    setHandOrder: (playerId: string, cardIds: string[]) => void; // 写入指定玩家的本地手牌顺序。
    setAutoSortEnabled: (enabled: boolean) => void; // 写入自动排序配置。
    pushEvents: (events: GameEventDTO[]) => void; // 写入最新事件列表。
    showNotice: (message: string) => void; // 显示非阻塞提醒。
    clearNotice: () => void; // 清空非阻塞提醒。
    clearSelection: () => void; // 清空当前选择状态。
}

/**
 * 创建对局页 UI 状态仓库。
 */
export const useGameUiStore = create<GameUiState>((set) => ({
    selectedCardId: "",
    selectedCardIds: [],
    selectedPairId: "",
    handOrderByPlayer: {},
    autoSortEnabled: false,
    events: [],
    eventHistory: [],
    noticeMessage: "",
    selectCard: (cardId) => {
        logWebGameAction("ui", "select_card", { message: "切换手牌选择" });
        return set((state) => {
            /** 多选结果用于批量攻牌，最后一次选中的牌继续兼容旧单选交互。 */
            const nextSelectedCardIds = state.selectedCardIds.includes(cardId)
                ? state.selectedCardIds.filter((item) => item !== cardId)
                : state.selectedCardIds.concat(cardId);
            return {
                selectedCardIds: nextSelectedCardIds,
                selectedCardId:
                    nextSelectedCardIds[nextSelectedCardIds.length - 1] ?? "",
            };
        });
    },
    selectPair: (pairId) => {
        logWebGameAction("ui", "select_pair", {
            targetPairId: pairId,
        });
        return set((state) => ({
            selectedPairId: state.selectedPairId === pairId ? "" : pairId,
        }));
    },
    setHandOrder: (playerId, cardIds) => {
        logWebGameAction("ui", "set_hand_order", {
            playerId,
            handCount: cardIds.length,
            message: "更新本地手牌顺序",
        });
        return set((state) => ({
            handOrderByPlayer: {
                ...state.handOrderByPlayer,
                [playerId]: cardIds,
            },
        }));
    },
    setAutoSortEnabled: (enabled) => {
        logWebGameAction("ui", "set_auto_sort", {
            success: enabled,
            message: enabled ? "开启自动排序" : "关闭自动排序",
        });
        return set({ autoSortEnabled: enabled });
    },
    pushEvents: (events) => {
        logWebGameAction("ui", "push_events", {
            actions: events.length,
            message: events.map((event) => event.message).join("；"),
        });
        return set((state) => ({
            events,
            eventHistory: state.eventHistory.concat(events).slice(-80),
        }));
    },
    showNotice: (message) => {
        logWebGameAction("ui", "show_notice", { message });
        return set({ noticeMessage: message });
    },
    clearNotice: () => {
        logWebGameAction("ui", "clear_notice");
        return set({ noticeMessage: "" });
    },
    clearSelection: () => {
        logWebGameAction("ui", "clear_selection");
        return set({
            selectedCardId: "",
            selectedCardIds: [],
            selectedPairId: "",
        });
    },
}));
