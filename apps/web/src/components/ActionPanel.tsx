/**
 * 对局动作面板组件，负责把当前选择状态转换成可提交动作。
 */
import { GameActionType } from "@gonghua/contracts";
import type { GameActionDTO, GameViewStateDTO } from "@gonghua/contracts";
import {
    findSelectedAttackAction,
    findSelectedDefenseAction,
    findSelectedRecallAction,
    findSimpleViewAction,
    getViewLegalActions,
} from "../utils/viewLegalActions";

/**
 * 动作面板组件入参。
 */
interface ActionPanelProps {
    viewState: GameViewStateDTO; // 当前玩家视角状态。
    selectedCardId: string; // 当前选中的手牌标识。
    selectedCardIds: string[]; // 当前点击多选的手牌标识列表。
    selectedPairId: string; // 当前选中的桌面牌位标识。
    loading: boolean; // 动作提交是否正在进行。
    onSubmit: (action: GameActionDTO) => void; // 提交对局动作的回调。
    onClear: () => void; // 清空当前选择的回调。
}

/**
 * 渲染当前玩家可用的动作按钮。
 */
export function ActionPanel({
    viewState,
    selectedCardId,
    selectedCardIds,
    selectedPairId,
    loading,
    onSubmit,
    onClear,
}: ActionPanelProps) {
    /** 根据当前玩家视角和选择状态生成按钮可提交动作。 */
    const legalActions = getViewLegalActions({
        viewState,
        selectedCardId,
        selectedCardIds,
        selectedPairId,
    });
    /** 不依赖额外参数的流程动作。 */
    const exchangeAction = findSimpleViewAction(
        legalActions,
        GameActionType.EXCHANGE_TRUMP_CARD,
    );
    const stopAttackAction = findSimpleViewAction(
        legalActions,
        GameActionType.STOP_ATTACK,
    );
    const giveUpDefenseAction = findSimpleViewAction(
        legalActions,
        GameActionType.GIVE_UP_DEFENSE,
    );
    const collectTableAction = findSimpleViewAction(
        legalActions,
        GameActionType.COLLECT_TABLE_CARDS,
    );
    /** 依赖当前选择的出牌和撤回动作。 */
    const attackAction = findSelectedAttackAction(legalActions);
    const defenseAction = findSelectedDefenseAction(legalActions);
    const recallAction = findSelectedRecallAction(legalActions);

    return (
        <section className="action-panel">
            <button
                type="button"
                disabled={exchangeAction === undefined || loading}
                onClick={() => {
                    if (exchangeAction !== undefined) {
                        onSubmit(exchangeAction);
                    }
                }}
            >
                换底
            </button>
            <button
                type="button"
                disabled={attackAction === undefined || loading}
                onClick={() => {
                    if (attackAction !== undefined) {
                        onSubmit(attackAction);
                    }
                }}
            >
                {selectedCardIds.length > 1 ? "出多张攻牌" : "出攻牌"}
            </button>
            <button
                type="button"
                disabled={defenseAction === undefined || loading}
                onClick={() => {
                    if (defenseAction !== undefined) {
                        onSubmit(defenseAction);
                    }
                }}
            >
                出守牌
            </button>
            <button
                type="button"
                disabled={recallAction === undefined || loading}
                onClick={() => {
                    if (recallAction !== undefined) {
                        onSubmit(recallAction);
                    }
                }}
            >
                撤回守牌
            </button>
            <button
                type="button"
                disabled={stopAttackAction === undefined || loading}
                onClick={() => {
                    if (stopAttackAction !== undefined) {
                        onSubmit(stopAttackAction);
                    }
                }}
            >
                停止进攻
            </button>
            <button
                type="button"
                disabled={giveUpDefenseAction === undefined || loading}
                onClick={() => {
                    if (giveUpDefenseAction !== undefined) {
                        onSubmit(giveUpDefenseAction);
                    }
                }}
            >
                放弃防守
            </button>
            <button
                type="button"
                disabled={collectTableAction === undefined || loading}
                onClick={() => {
                    if (collectTableAction !== undefined) {
                        onSubmit(collectTableAction);
                    }
                }}
            >
                确认收牌
            </button>
            <button type="button" disabled={loading} onClick={onClear}>
                清除选择
            </button>
        </section>
    );
}
