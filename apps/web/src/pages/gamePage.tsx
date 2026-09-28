/**
 * 对局页组件，负责拉取玩家视角、维护本地选择状态并提交对局动作。
 */
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    pointerWithin,
    rectIntersection,
    TouchSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import type {
    CollisionDetection,
    DragEndEvent,
    DragStartEvent,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
    CardDTO,
    GameActionDTO,
    GameEventDTO,
    GameMutationResponseDTO,
    PlayerViewDTO,
} from "@gonghua/contracts";
import {
    GameErrorCode,
    GameFinishReason,
    GamePhase,
    GameMode,
    PlayerRole,
} from "@gonghua/contracts";
import { ActionPanel } from "../components/ActionPanel";
import { CardView } from "../components/CardView";
import type { CardDragPayload } from "../components/CardView";
import { HandArea } from "../components/HandArea";
import { PlayerPanel } from "../components/PlayerPanel";
import { TableArea } from "../components/TableArea";
import { TABLE_DROP_ZONE_ID } from "../components/TableArea";
import type { PairDropPayload } from "../components/TableArea";
import {
    ApiError,
    createGame,
    finishGame,
    getGame,
    submitBotStep,
    submitGameAction,
} from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { useGameUiStore } from "../stores/gameUiStore";
import { sortCardsByRule } from "../utils/cardSort";
import { logWebGameAction } from "../utils/gameLogger";
import {
    findSelectedAttackAction,
    findSelectedDefenseAction,
    findSelectedMoveDefenseAction,
    getViewLegalActions,
} from "../utils/viewLegalActions";

/** 机器人每一步操作的前端展示延迟。 */
const BOT_STEP_DELAY_MS = 500;

/**
 * 判断拖拽碰撞结果是否指向具体攻守牌位。
 */
function isPairSlotCollisionId(collisionId: string | number): boolean {
    return String(collisionId).startsWith("pair-slot:");
}

/**
 * 拖拽落点优先判定具体攻守牌位，只有没有命中牌位时才兜底到桌面整体区域。
 */
const pairSlotFirstCollisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    const pointerPairSlots = pointerCollisions.filter((collision) =>
        isPairSlotCollisionId(collision.id),
    );
    if (pointerPairSlots.length > 0) {
        return pointerPairSlots;
    }
    const pointerTableZones = pointerCollisions.filter(
        (collision) => collision.id === TABLE_DROP_ZONE_ID,
    );
    if (pointerTableZones.length > 0) {
        return pointerTableZones;
    }

    /** 指针不可用时再用矩形相交兜底，但仍然保持牌位优先。 */
    const rectCollisions = rectIntersection(args);
    const rectPairSlots = rectCollisions.filter((collision) =>
        isPairSlotCollisionId(collision.id),
    );
    if (rectPairSlots.length > 0) {
        return rectPairSlots;
    }
    return rectCollisions.filter(
        (collision) => collision.id === TABLE_DROP_ZONE_ID,
    );
};

/**
 * 判断投放区数据是否为桌面牌位。
 */
function isPairDropPayload(payload: unknown): payload is PairDropPayload {
    if (payload === null || typeof payload !== "object") {
        return false;
    }
    /** 投放区数据只读取已声明字段，避免拖拽库内部数据结构影响业务判断。 */
    const candidate = payload as Partial<PairDropPayload>;
    return (
        candidate.dropType === "pair-slot" &&
        typeof candidate.pairId === "string"
    );
}

/**
 * 判断拖拽数据是否为卡牌拖拽。
 */
function isCardDragPayload(payload: unknown): payload is CardDragPayload {
    if (payload === null || typeof payload !== "object") {
        return false;
    }
    /** 卡牌拖拽数据必须携带卡牌标识和卡牌展示数据。 */
    const candidate = payload as Partial<CardDragPayload>;
    return (
        (candidate.dragType === "hand-card" ||
            candidate.dragType === "defense-card") &&
        typeof candidate.cardId === "string" &&
        candidate.card !== undefined
    );
}

/**
 * 从 dnd-kit 节点标识中提取手牌标识。
 */
function getHandCardId(dragId: string): string {
    return dragId.startsWith("hand-card:")
        ? dragId.replace("hand-card:", "")
        : "";
}

/**
 * 合并服务端最新手牌和本地保存顺序，过滤已打出的牌并追加新增牌。
 */
function applyLocalHandOrder(
    cards: CardDTO[],
    orderedCardIds: string[],
): CardDTO[] {
    const cardById = new Map(cards.map((card) => [card.id, card]));
    const orderedCards = orderedCardIds
        .map((cardId) => cardById.get(cardId))
        .filter((card): card is CardDTO => card !== undefined);
    const orderedIdSet = new Set(orderedCards.map((card) => card.id));
    const newCards = cards.filter((card) => !orderedIdSet.has(card.id));
    return orderedCards.concat(newCards);
}

/**
 * 移动数组中的单个元素，返回新的手牌标识顺序。
 */
function moveCardId(
    cardIds: string[],
    activeId: string,
    overId: string,
): string[] {
    const fromIndex = cardIds.indexOf(activeId);
    const toIndex = cardIds.indexOf(overId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
        return cardIds;
    }
    const nextCardIds = cardIds.slice();
    const [movedCardId] = nextCardIds.splice(fromIndex, 1);
    if (movedCardId === undefined) {
        return cardIds;
    }
    nextCardIds.splice(toIndex, 0, movedCardId);
    return nextCardIds;
}

/**
 * 创建玩家标识到展示昵称的映射，事件栏只用昵称展示，不直接暴露用户标识。
 */
function createPlayerNameMap(players: PlayerViewDTO[]): Map<string, string> {
    return new Map(players.map((player) => [player.playerId, player.name]));
}

/**
 * 把事件原始消息转换成页面展示消息，兼容历史快照中已经写入用户标识的事件。
 */
function formatEventMessage(
    event: GameEventDTO,
    playerNameById: Map<string, string>,
): GameEventDTO {
    let message = event.message;
    for (const [playerId, playerName] of playerNameById.entries()) {
        if (playerId.length === 0 || playerId === playerName) {
            continue;
        }
        message = message.split(playerId).join(playerName);
    }
    if (event.playerId !== undefined) {
        const playerName = playerNameById.get(event.playerId);
        if (
            playerName !== undefined &&
            message.startsWith(`${event.playerId} `)
        ) {
            message = `${playerName}${message.slice(event.playerId.length)}`;
        }
    }
    return { ...event, message };
}

/**
 * 创建客户端动作幂等标识，浏览器不支持 `crypto.randomUUID` 时使用时间和随机数兜底。
 */
function createClientActionId(): string {
    if (crypto.randomUUID !== undefined) {
        return crypto.randomUUID();
    }
    return `action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 渲染当前玩家的对局页面。
 */
export function GamePage() {
    /** 路由中的对局标识，用于查询和提交动作。 */
    const { gameId = "" } = useParams();
    /** 路由跳转函数，用于处理对局不存在等页面级异常。 */
    const navigate = useNavigate();
    /** 当前登录用户既是玩家视角来源，也用于修正历史对局快照中的本人展示名。 */
    const authUser = useAuthStore((state) => state.user);
    /** 当前客户端代表的玩家标识来自登录态，不再暴露在浏览器地址栏。 */
    const playerId = authUser?.id ?? "";
    /** 请求缓存客户端，用于动作成功后写入最新对局视角。 */
    const queryClient = useQueryClient();
    /** 当前选中的手牌标识。 */
    const selectedCardId = useGameUiStore((state) => state.selectedCardId);
    /** 当前点击多选的手牌标识列表。 */
    const selectedCardIds = useGameUiStore((state) => state.selectedCardIds);
    /** 当前选中的桌面牌位标识。 */
    const selectedPairId = useGameUiStore((state) => state.selectedPairId);
    /** 选择或取消选择手牌的状态动作。 */
    const selectCard = useGameUiStore((state) => state.selectCard);
    /** 选择或取消选择桌面牌位的状态动作。 */
    const selectPair = useGameUiStore((state) => state.selectPair);
    /** 清空当前手牌和桌面牌位选择。 */
    const clearSelection = useGameUiStore((state) => state.clearSelection);
    /** 写入最近一次服务端返回的对局事件。 */
    const pushEvents = useGameUiStore((state) => state.pushEvents);
    /** 当前页面展示的连续对局事件流水。 */
    const eventHistory = useGameUiStore((state) => state.eventHistory);
    /** 每个玩家本地保存的手牌展示顺序。 */
    const handOrderByPlayer = useGameUiStore(
        (state) => state.handOrderByPlayer,
    );
    /** 当前是否开启自动排序配置。 */
    const autoSortEnabled = useGameUiStore((state) => state.autoSortEnabled);
    /** 写入指定玩家手牌展示顺序。 */
    const setHandOrder = useGameUiStore((state) => state.setHandOrder);
    /** 写入自动排序配置。 */
    const setAutoSortEnabled = useGameUiStore(
        (state) => state.setAutoSortEnabled,
    );
    /** 当前非阻塞提醒文案。 */
    const noticeMessage = useGameUiStore((state) => state.noticeMessage);
    /** 显示非阻塞提醒。 */
    const showNotice = useGameUiStore((state) => state.showNotice);
    /** 清空非阻塞提醒。 */
    const clearNotice = useGameUiStore((state) => state.clearNotice);
    /** 当前拖动中的卡牌，用于渲染跟随指针的卡牌浮层。 */
    const [activeDragCard, setActiveDragCard] = useState<CardDTO | null>(null);
    /** 已经释放并提交中的拖出手牌，服务端响应前继续隐藏原位置避免闪回。 */
    const [pendingDropCardIds, setPendingDropCardIds] = useState<string[]>([]);
    /** 指针拖拽传感器，设置最小移动距离避免点击卡牌时误触拖拽。 */
    const pointerSensor = useSensor(PointerSensor, {
        activationConstraint: { distance: 6 },
    });
    /** 触屏拖拽传感器，设置短延迟减少横屏滑动和拖牌之间的冲突。 */
    const touchSensor = useSensor(TouchSensor, {
        activationConstraint: { delay: 120, tolerance: 6 },
    });
    /** 当前页面启用的拖拽传感器集合。 */
    const sensors = useSensors(pointerSensor, touchSensor);

    useEffect(() => {
        if (noticeMessage.length === 0) {
            return;
        }
        /** 非阻塞提醒自动消失，不打断玩家连续操作。 */
        const timer = window.setTimeout(() => clearNotice(), 2600);
        return () => window.clearTimeout(timer);
    }, [clearNotice, noticeMessage]);

    /** 对局查询缓存键，按对局和玩家视角隔离。 */
    const queryKey = useMemo(
        () => ["game", gameId, playerId],
        [gameId, playerId],
    );
    /** 当前玩家视角查询，后端负责过滤其他玩家手牌。 */
    const gameQuery = useQuery({
        queryKey,
        queryFn: () => getGame(gameId),
        enabled: gameId.length > 0 && playerId.length > 0,
        refetchInterval: (query) => {
            const response = query.state.data as
                GameMutationResponseDTO | undefined;
            if (
                response === undefined ||
                response.viewState.mode === GameMode.HUMAN_VS_BOTS ||
                response.viewState.phase === GamePhase.GAME_OVER
            ) {
                return false;
            }
            return 1500;
        },
    });

    useEffect(() => {
        if (
            gameQuery.error instanceof ApiError &&
            gameQuery.error.errorCode === GameErrorCode.GAME_NOT_FOUND
        ) {
            logWebGameAction("page", "redirect_game_not_found", {
                currentPage: "GamePage",
                gameId,
                errorCode: gameQuery.error.errorCode,
                message: "对局不存在，返回首页",
            });
            navigate("/", { replace: true });
        }
    }, [gameId, gameQuery.error, navigate]);

    useEffect(() => {
        if (!autoSortEnabled || gameQuery.data === undefined) {
            return;
        }
        /** 自动排序开启时，服务端手牌变化后同步生成新的本地展示顺序。 */
        const nextViewState = gameQuery.data.viewState;
        const nextCurrentPlayer = nextViewState.players.find(
            (player) => player.isCurrentPlayer,
        );
        if (nextCurrentPlayer === undefined) {
            return;
        }
        setHandOrder(
            nextCurrentPlayer.playerId,
            sortCardsByRule(
                nextCurrentPlayer.handCards,
                nextViewState.trumpSuit,
            ).map((card) => card.id),
        );
    }, [autoSortEnabled, gameQuery.data, setHandOrder]);

    /** 动作提交请求，成功后直接刷新当前缓存中的玩家视角。 */
    const actionMutation = useMutation({
        mutationFn: (action: GameActionDTO) =>
            submitGameAction(gameId, {
                playerId,
                action,
                clientActionId: createClientActionId(),
                stateVersion: gameQuery.data?.viewState.stateVersion ?? 0,
            }),
        onSuccess: (data) => {
            logWebGameAction("page", "submit_action_success", {
                currentPage: "GamePage",
                gameId,
                playerId,
                phase: data.viewState.phase,
                tablePairCount: data.viewState.tablePairs.length,
                localCards:
                    data.viewState.players.find(
                        (player) => player.isCurrentPlayer,
                    )?.handCount ?? 0,
                success: true,
            });
            queryClient.setQueryData(queryKey, data);
            pushEvents(data.events);
            clearSelection();
            setPendingDropCardIds([]);
        },
        onError: (error) => {
            const errorMessage =
                error instanceof Error ? error.message : "动作提交失败";
            logWebGameAction("page", "submit_action_failed", {
                currentPage: "GamePage",
                gameId,
                playerId,
                errorMessage,
                success: false,
            });
            if (
                error instanceof ApiError &&
                error.errorCode === GameErrorCode.STATE_VERSION_CONFLICT
            ) {
                /** 多人房间中状态已落后时，立即刷新最新视角供玩家重新选择动作。 */
                void gameQuery.refetch();
                clearSelection();
                showNotice("状态已更新，请重新操作");
                setPendingDropCardIds([]);
                return;
            }
            showNotice(errorMessage);
            setPendingDropCardIds([]);
        },
    });

    /** 机器人单步推进请求，前端通过延迟连续调用来展示动作过程。 */
    const botStepMutation = useMutation({
        mutationFn: () => submitBotStep(gameId, playerId),
        onSuccess: (data) => {
            logWebGameAction("page", "submit_bot_step_success", {
                currentPage: "GamePage",
                gameId,
                playerId,
                phase: data.viewState.phase,
                tablePairCount: data.viewState.tablePairs.length,
                actions: data.events.length,
                success: true,
            });
            queryClient.setQueryData(queryKey, data);
            pushEvents(data.events);
            clearSelection();
        },
        onError: (error) => {
            const errorMessage =
                error instanceof Error ? error.message : "机器人动作推进失败";
            logWebGameAction("page", "submit_bot_step_failed", {
                currentPage: "GamePage",
                gameId,
                playerId,
                errorMessage,
                success: false,
            });
            showNotice(errorMessage);
        },
    });
    /** 机器人推进提交函数，拆出后避免 effect 依赖整个 mutation 对象。 */
    const { mutate: mutateBotStep, isPending: isBotStepPending } =
        botStepMutation;

    /** 退出人机局请求，成功后让旧局不再被未结束对局逻辑恢复。 */
    const exitGameMutation = useMutation({
        mutationFn: () =>
            finishGame(gameId, {
                playerId,
                finishReason: GameFinishReason.PLAYER_EXIT,
            }),
        onSuccess: (data) => {
            queryClient.setQueryData(queryKey, data);
            queryClient.setQueryData(
                ["records", "active-game", playerId],
                null,
            );
            queryClient.invalidateQueries({
                queryKey: ["records", "active-game", playerId],
            });
            pushEvents(data.events);
            navigate("/lobby", { replace: true });
        },
        onError: (error) => {
            const errorMessage =
                error instanceof Error ? error.message : "退出游戏失败";
            showNotice(errorMessage);
        },
    });

    /** 重新开始人机局请求，先结束旧局，再按当前人数创建新局。 */
    const restartGameMutation = useMutation({
        mutationFn: async () => {
            const playerCount = gameQuery.data?.viewState.players.length ?? 4;
            await finishGame(gameId, {
                playerId,
                finishReason: GameFinishReason.RESTART,
            });
            return createGame({
                playerCount,
                mode: GameMode.HUMAN_VS_BOTS,
            });
        },
        onSuccess: (data) => {
            queryClient.setQueryData(
                ["records", "active-game", playerId],
                null,
            );
            queryClient.invalidateQueries({
                queryKey: ["records", "active-game", playerId],
            });
            pushEvents(data.events);
            navigate(`/game/${data.viewState.gameId}`, { replace: true });
        },
        onError: (error) => {
            const errorMessage =
                error instanceof Error ? error.message : "重新开始失败";
            showNotice(errorMessage);
        },
    });

    /**
     * 提交下一步机器人动作，供延迟定时器调用。
     */
    const submitNextBotStep = useCallback(() => {
        mutateBotStep();
    }, [mutateBotStep]);

    /**
     * 提交拖拽生成的手牌动作，并在服务端响应前隐藏原手牌占位。
     */
    const submitDraggedHandAction = useCallback(
        (action: GameActionDTO, cardId: string) => {
            setPendingDropCardIds((currentCardIds) =>
                currentCardIds.includes(cardId)
                    ? currentCardIds
                    : currentCardIds.concat(cardId),
            );
            actionMutation.mutate(action);
        },
        [actionMutation],
    );

    useEffect(() => {
        if (
            gameQuery.data?.hasPendingBotAction !== true ||
            actionMutation.isPending ||
            isBotStepPending
        ) {
            return;
        }
        /** 每次只推进一个机器人动作，让事件栏按 0.5 秒节奏刷新。 */
        const timer = window.setTimeout(() => {
            submitNextBotStep();
        }, BOT_STEP_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [
        actionMutation.isPending,
        gameQuery.data?.hasPendingBotAction,
        isBotStepPending,
        submitNextBotStep,
    ]);

    /**
     * 处理拖拽开始事件，记录拖动中的牌面用于浮层展示。
     */
    const handleDragStart = (event: DragStartEvent) => {
        const payload = event.active.data.current;
        if (!isCardDragPayload(payload)) {
            return;
        }
        logWebGameAction("ui", "drag_card_start", {
            message: `开始拖动卡牌：${payload.cardId}`,
        });
        setActiveDragCard(payload.card);
    };

    /**
     * 处理拖拽结束事件，把拖拽来源和落点转换成现有对局动作。
     */
    const handleDragEnd = (event: DragEndEvent) => {
        setActiveDragCard(null);
        const payload = event.active.data.current;
        if (!isCardDragPayload(payload)) {
            return;
        }
        if (event.over === null) {
            return;
        }
        const activeId = String(event.active.id);
        const overId = String(event.over.id);
        if (
            payload.dragType === "hand-card" &&
            overId.startsWith("hand-card:")
        ) {
            const activeCardId = getHandCardId(activeId);
            const overCardId = getHandCardId(overId);
            const currentCardIds = orderedHandCards.map((card) => card.id);
            const nextCardIds = moveCardId(
                currentCardIds,
                activeCardId,
                overCardId,
            );
            if (nextCardIds !== currentCardIds) {
                setAutoSortEnabled(false);
                setHandOrder(playerId, nextCardIds);
            }
            return;
        }
        const dropPayload = event.over.data.current;
        const pairDropPayload = isPairDropPayload(dropPayload)
            ? dropPayload
            : null;

        if (payload.dragType === "hand-card") {
            if (currentPlayer?.role === PlayerRole.DEFENSE) {
                if (pairDropPayload === null) {
                    showNotice("请拖到需要防守的攻牌上");
                    return;
                }
                const defenseAction = findSelectedDefenseAction(
                    getViewLegalActions({
                        viewState,
                        selectedCardId: payload.cardId,
                        selectedPairId: pairDropPayload.pairId,
                    }),
                );
                if (defenseAction === undefined) {
                    showNotice("当前卡牌不能防守该攻牌");
                    return;
                }
                submitDraggedHandAction(defenseAction, payload.cardId);
                return;
            }
            if (
                event.over.id === TABLE_DROP_ZONE_ID ||
                pairDropPayload !== null
            ) {
                const attackAction = findSelectedAttackAction(
                    getViewLegalActions({
                        viewState,
                        selectedCardId: payload.cardId,
                        selectedPairId: "",
                    }),
                );
                if (attackAction === undefined) {
                    showNotice("当前卡牌不能作为攻牌打出");
                    return;
                }
                submitDraggedHandAction(attackAction, payload.cardId);
            }
            return;
        }

        if (payload.dragType === "defense-card") {
            if (pairDropPayload === null) {
                showNotice("请拖到要换到的攻牌上");
                return;
            }
            if (payload.sourcePairId === pairDropPayload.pairId) {
                return;
            }
            const moveAction = findSelectedMoveDefenseAction(
                getViewLegalActions({
                    viewState,
                    selectedCardId: "",
                    selectedPairId: "",
                    sourcePairId: payload.sourcePairId,
                    targetPairId: pairDropPayload.pairId,
                }),
            );
            if (moveAction === undefined) {
                showNotice("当前守牌不能移动到该攻牌上");
                return;
            }
            actionMutation.mutate(moveAction);
        }
    };

    /**
     * 处理拖拽取消事件，清除拖动浮层。
     */
    const handleDragCancel = () => {
        setActiveDragCard(null);
    };

    if (gameQuery.isLoading) {
        return (
            <section className="content-page">
                <p>对局加载中</p>
            </section>
        );
    }
    if (gameQuery.error instanceof Error) {
        if (
            gameQuery.error instanceof ApiError &&
            gameQuery.error.errorCode === GameErrorCode.GAME_NOT_FOUND
        ) {
            return (
                <section className="content-page">
                    <p>对局不存在，正在返回首页</p>
                </section>
            );
        }
        return (
            <section className="content-page">
                <p>{gameQuery.error.message}</p>
            </section>
        );
    }

    /** 查询成功后的业务数据，保留空值分支用于兼容异常响应。 */
    const data = gameQuery.data as GameMutationResponseDTO | undefined;
    if (data === undefined) {
        return (
            <section className="content-page">
                <p>未找到对局数据</p>
            </section>
        );
    }
    /** 服务端返回的当前玩家可见对局状态。 */
    const viewState = data.viewState;
    /** 只有人机局允许直接退出或重新开始，普通房间局后续按联机规则处理。 */
    const isHumanVsBotsMode = viewState.mode === GameMode.HUMAN_VS_BOTS;
    /** 人机局结束类操作共用禁用态，避免重复点击产生多次终止请求。 */
    const gameLifecycleLoading =
        exitGameMutation.isPending || restartGameMutation.isPending;
    /** 展示用玩家列表，历史快照中的本人名称用当前账号昵称兜底。 */
    const displayPlayers = viewState.players.map((player) =>
        player.isCurrentPlayer && authUser !== undefined
            ? { ...player, name: authUser.nickname }
            : player,
    );
    /** 玩家标识到昵称的映射，只用于页面展示，不改变事件原始数据。 */
    const playerNameById = createPlayerNameMap(displayPlayers);
    /** 当前玩家用于渲染底部手牌区。 */
    const currentPlayer = displayPlayers.find(
        (player) => player.isCurrentPlayer,
    );
    /** 服务端返回的当前玩家原始手牌。 */
    const currentHandCards = currentPlayer?.handCards ?? [];
    /** 当前玩家本地保存的手牌顺序。 */
    const localHandOrder = handOrderByPlayer[playerId] ?? [];
    /** 当前实际展示的手牌，自动排序优先，否则使用本地手动顺序。 */
    const orderedHandCards = autoSortEnabled
        ? sortCardsByRule(currentHandCards, viewState.trumpSuit)
        : applyLocalHandOrder(currentHandCards, localHandOrder);
    /** 一键排序后的手牌标识顺序。 */
    const ruleSortedHandCardIds = sortCardsByRule(
        currentHandCards,
        viewState.trumpSuit,
    ).map((card) => card.id);
    /** 事件栏按从新到旧展示，保证最新动作始终位于顶部。 */
    const newestFirstEvents = eventHistory
        .slice()
        .reverse()
        .map((event) => formatEventMessage(event, playerNameById));
    logWebGameAction("page", "render_game", {
        currentPage: "GamePage",
        gameId: viewState.gameId,
        playerId: viewState.localPlayerId,
        phase: viewState.phase,
        deckCount: viewState.deckCount,
        localCards: currentPlayer?.handCount ?? 0,
        tablePairCount: viewState.tablePairs.length,
    });

    return (
        <section className="game-page">
            {noticeMessage.length > 0 ? (
                <div className="notice-toast" role="status">
                    {noticeMessage}
                </div>
            ) : null}

            <div className="game-topbar">
                <div className="game-status-list">
                    <span>主花色：{viewState.trumpCard.label}</span>
                    <span>牌堆：{viewState.deckCount}</span>
                    <span>弃牌：{viewState.discardCount}</span>
                    <span>
                        {viewState.isNoRefillMode ? "只出不添" : "正常补牌"}
                    </span>
                    <span>{viewState.message}</span>
                </div>
                {isHumanVsBotsMode ? (
                    <div className="game-lifecycle-actions">
                        <button
                            type="button"
                            className="secondary-button"
                            onClick={() => exitGameMutation.mutate()}
                            disabled={gameLifecycleLoading}
                        >
                            {exitGameMutation.isPending ? "退出中" : "退出游戏"}
                        </button>
                        <button
                            type="button"
                            className="primary-button"
                            onClick={() => restartGameMutation.mutate()}
                            disabled={gameLifecycleLoading}
                        >
                            {restartGameMutation.isPending
                                ? "重开中"
                                : "重新开始"}
                        </button>
                    </div>
                ) : null}
            </div>

            <div className="players-grid">
                {displayPlayers.map((player) => (
                    <PlayerPanel
                        key={player.playerId}
                        player={player}
                        trumpSuit={viewState.trumpSuit}
                    />
                ))}
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={pairSlotFirstCollisionDetection}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
            >
                <div className="game-board-layout">
                    <TableArea
                        pairs={viewState.tablePairs}
                        selectedPairId={selectedPairId}
                        onSelectPair={selectPair}
                        dragDisabled={actionMutation.isPending}
                    />

                    <section className="event-panel">
                        {viewState.rankings.length > 0 ? (
                            <div className="ranking-list">
                                {viewState.rankings.map((rankItem) => (
                                    <span key={rankItem.playerId}>
                                        第{rankItem.rank}名：{rankItem.name}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        <p>事件</p>
                        {eventHistory.length > 0 ? (
                            <div className="event-list">
                                {newestFirstEvents.map((event, index) => (
                                    <div
                                        className="event-item"
                                        key={`${event.type}-${index}`}
                                    >
                                        {event.message}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <span>暂无事件</span>
                        )}
                    </section>
                </div>

                <HandArea
                    cards={orderedHandCards}
                    selectedCardId={selectedCardId}
                    selectedCardIds={selectedCardIds}
                    hiddenCardIds={pendingDropCardIds}
                    autoSortEnabled={autoSortEnabled}
                    onSelectCard={selectCard}
                    onSortByRule={() =>
                        setHandOrder(playerId, ruleSortedHandCardIds)
                    }
                    onToggleAutoSort={(enabled) => {
                        setAutoSortEnabled(enabled);
                        if (enabled) {
                            setHandOrder(playerId, ruleSortedHandCardIds);
                        }
                    }}
                    dragDisabled={actionMutation.isPending}
                />

                <DragOverlay dropAnimation={null}>
                    {activeDragCard === null ? null : (
                        <div className="drag-overlay-card">
                            <CardView card={activeDragCard} motionDisabled />
                        </div>
                    )}
                </DragOverlay>
            </DndContext>

            <ActionPanel
                viewState={viewState}
                selectedCardId={selectedCardId}
                selectedCardIds={selectedCardIds}
                selectedPairId={selectedPairId}
                loading={actionMutation.isPending}
                onSubmit={(action) => actionMutation.mutate(action)}
                onClear={clearSelection}
            />
        </section>
    );
}
