/**
 * 大厅页组件。
 *
 * 本文件负责接入房间 HTTP 流程：创建房间、查询房间、加入房间、准备和房主开始对局。
 * 当前使用 HTTP 轮询同步房间快照，不实现房间列表和 WebSocket 同步。
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Bot,
    Clipboard,
    DoorOpen,
    Play,
    Plus,
    RefreshCw,
    UserPlus,
    Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GameMode } from "@gonghua/contracts";
import { useActiveGameRecord } from "../hooks/useActiveGameRecord";
import {
    createGame,
    createRoom,
    getRoom,
    joinRoomByCode,
    startRoomGame,
    updateRoomReady,
} from "../services/api";
import { useAuthStore } from "../stores/authStore";

/**
 * 渲染大厅房间调试入口。
 */
export function LobbyPage() {
    /** 页面跳转函数，房主开始成功后进入对局页。 */
    const navigate = useNavigate();
    /** 查询缓存客户端，用于房间写操作后刷新当前房间快照。 */
    const queryClient = useQueryClient();
    /** 当前登录用户，作为创建房间和开始对局的身份来源。 */
    const user = useAuthStore((state) => state.user);
    /** 当前正在查看或操作的真实房间标识，创建或按房间号加入后由服务端返回。 */
    const [roomId, setRoomId] = useState("");
    /** 用户输入的房间号，用于加入其他玩家创建的房间。 */
    const [roomCodeInput, setRoomCodeInput] = useState("");
    /** 创建房间时选择的目标人数，服务端仍会校验合法范围。 */
    const [playerCount, setPlayerCount] = useState(4);
    /** 创建联机房间时是否允许机器人补位，服务端仍会以房间配置为准。 */
    const [botFillEnabled, setBotFillEnabled] = useState(true);
    /** 当前加入玩家准备状态，提交后以后端返回为准。 */
    const [joinReady, setJoinReady] = useState(true);
    /** 复制房间号后的轻提示，用于反馈剪贴板结果。 */
    const [copyMessage, setCopyMessage] = useState("");
    /** 当前用户未结束对局，存在时禁止加入或创建其他对局。 */
    const activeGameQuery = useActiveGameRecord(user?.id);
    /** 房间查询缓存键，跟随当前输入的房间标识变化。 */
    const roomQueryKey = useMemo(() => ["room", roomId], [roomId]);
    /** 当前房间快照查询，只有填入房间标识后才启用。 */
    const roomQuery = useQuery({
        queryKey: roomQueryKey,
        queryFn: () => getRoom(roomId),
        enabled: roomId.length > 0,
        refetchInterval: roomId.length > 0 ? 1500 : false,
    });
    /** 当前房间快照，优先使用查询缓存。 */
    const room = roomQuery.data;
    /** 当前用户尚未结束的对局记录，用于限制同时加入多个对局。 */
    const activeGame = activeGameQuery.data;
    const hasActiveGame = activeGame !== undefined && activeGame !== null;
    /** 房主是否为当前本地用户。 */
    const isOwner = room?.ownerUserId === user?.id;
    /** 加入玩家是否已经在当前房间内。 */
    const joinedPlayer = room?.players.find(
        (player) => player.userId === user?.id && player.leftAt === undefined,
    );
    /** 房间是否仍允许成员和准备状态变更。 */
    const isRoomOpen = room?.status === "OPEN";
    /** 当前用户是否能修改自己的准备状态。 */
    const canSetReady =
        room !== undefined &&
        isRoomOpen &&
        joinedPlayer !== undefined &&
        !isOwner &&
        !hasActiveGame;
    /** 当前用户是否能发起开始对局。 */
    const canStartRoom =
        room !== undefined && isRoomOpen && isOwner && !hasActiveGame;
    /** 房间状态提示文案，避免用户只看到内部状态值。 */
    const roomStatusMessage = resolveRoomStatusMessage(room?.status);

    /** 创建房间请求，成功后自动选中该房间。 */
    const createRoomMutation = useMutation({
        mutationFn: () =>
            createRoom({
                playerCount,
                botFillEnabled,
            }),
        onSuccess: (data) => {
            setRoomId(data.id);
            setRoomCodeInput(data.roomCode);
            queryClient.setQueryData(["room", data.id], data);
        },
    });
    /** 创建人机对局请求，成功后直接进入对局页。 */
    const createBotGameMutation = useMutation({
        mutationFn: () =>
            createGame({
                playerCount,
                mode: GameMode.HUMAN_VS_BOTS,
            }),
        onSuccess: (data) => {
            navigate(`/game/${data.viewState.gameId}`);
        },
    });
    /** 按房间号加入房间，成功后切换到服务端返回的真实房间标识。 */
    const joinRoomByCodeMutation = useMutation({
        mutationFn: () =>
            joinRoomByCode({
                roomCode: roomCodeInput,
            }),
        onSuccess: (data) => {
            setRoomId(data.id);
            setRoomCodeInput(data.roomCode);
            queryClient.setQueryData(["room", data.id], data);
        },
    });
    /** 准备请求，提交后更新房间快照。 */
    const readyMutation = useMutation({
        mutationFn: () =>
            updateRoomReady(roomId, {
                ready: joinReady,
            }),
        onSuccess: (data) => {
            queryClient.setQueryData(roomQueryKey, data);
        },
    });
    /** 房主开始对局请求，成功后跳转到游戏页。 */
    const startMutation = useMutation({
        mutationFn: () => startRoomGame(roomId, {}),
        onSuccess: (data) => {
            navigate(`/game/${data.game.viewState.gameId}`);
        },
    });
    /** 所有写请求的首个错误，统一展示在页面底部。 */
    const currentError =
        createRoomMutation.error ??
        createBotGameMutation.error ??
        joinRoomByCodeMutation.error ??
        readyMutation.error ??
        startMutation.error ??
        roomQuery.error;

    /**
     * 已有未结束对局时，大厅默认进入该对局，避免同一用户同时加入多个对局。
     */
    useEffect(() => {
        if (
            user !== undefined &&
            activeGame !== undefined &&
            activeGame !== null
        ) {
            navigate(`/game/${activeGame.id}`, { replace: true });
        }
    }, [activeGame, navigate, user]);

    useEffect(() => {
        if (room?.currentGameId === undefined) {
            return;
        }
        /** 房间轮询发现已开局后，成员直接进入对应对局。 */
        navigate(`/game/${room.currentGameId}`, { replace: true });
    }, [navigate, room?.currentGameId]);

    useEffect(() => {
        if (copyMessage.length === 0) {
            return;
        }
        /** 复制提示自动消失，避免占用大厅操作区域。 */
        const timer = window.setTimeout(() => setCopyMessage(""), 2200);
        return () => window.clearTimeout(timer);
    }, [copyMessage]);

    /**
     * 复制当前房间号，方便房主发给另一个浏览器或用户。
     */
    async function handleCopyRoomCode() {
        if (room === undefined) {
            return;
        }
        try {
            await navigator.clipboard.writeText(room.roomCode);
            setCopyMessage("房间号已复制");
        } catch {
            setCopyMessage("复制失败，请手动复制房间号");
        }
    }

    if (user === undefined) {
        return null;
    }

    return (
        <section className="content-page lobby-page">
            <div className="page-heading">
                <h1>大厅</h1>
                <p>
                    {hasActiveGame
                        ? "检测到未结束对局，正在进入原对局。"
                        : `当前房主账号：${user.nickname}`}
                </p>
            </div>
            <div className="lobby-grid">
                <section className="lobby-section">
                    <div className="lobby-section-title">
                        <Bot size={18} />
                        <h2>人机对局</h2>
                    </div>
                    <label className="form-field compact-field">
                        <span>玩家人数</span>
                        <select
                            value={playerCount}
                            onChange={(event) =>
                                setPlayerCount(Number(event.target.value))
                            }
                            disabled={
                                activeGameQuery.isLoading || hasActiveGame
                            }
                        >
                            {[2, 3, 4, 5, 6].map((count) => (
                                <option key={count} value={count}>
                                    {count} 人
                                </option>
                            ))}
                        </select>
                    </label>
                    <button
                        type="button"
                        className="primary-button"
                        onClick={() => createBotGameMutation.mutate()}
                        disabled={
                            createBotGameMutation.isPending ||
                            activeGameQuery.isLoading ||
                            hasActiveGame
                        }
                    >
                        <Play size={18} />
                        {createBotGameMutation.isPending
                            ? "创建中"
                            : "创建人机对局"}
                    </button>
                </section>

                <section className="lobby-section">
                    <div className="lobby-section-title">
                        <Users size={18} />
                        <h2>创建联机房间</h2>
                    </div>
                    <label className="checkbox-field">
                        <input
                            type="checkbox"
                            checked={botFillEnabled}
                            onChange={(event) =>
                                setBotFillEnabled(event.target.checked)
                            }
                            disabled={
                                activeGameQuery.isLoading || hasActiveGame
                            }
                        />
                        <span>机器人补位</span>
                    </label>
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={() => createRoomMutation.mutate()}
                        disabled={
                            createRoomMutation.isPending ||
                            activeGameQuery.isLoading ||
                            hasActiveGame
                        }
                    >
                        <Plus size={18} />
                        {createRoomMutation.isPending ? "创建中" : "创建房间"}
                    </button>
                </section>

                <section className="lobby-section">
                    <div className="lobby-section-title">
                        <UserPlus size={18} />
                        <h2>加入联机房间</h2>
                    </div>
                    <label className="form-field">
                        <span>房间号</span>
                        <input
                            value={roomCodeInput}
                            onChange={(event) =>
                                setRoomCodeInput(event.target.value)
                            }
                            placeholder="输入房间号"
                            disabled={
                                activeGameQuery.isLoading || hasActiveGame
                            }
                        />
                    </label>
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={() => joinRoomByCodeMutation.mutate()}
                        disabled={
                            roomCodeInput.trim().length === 0 ||
                            activeGameQuery.isLoading ||
                            hasActiveGame ||
                            joinRoomByCodeMutation.isPending
                        }
                    >
                        <UserPlus size={17} />
                        {joinRoomByCodeMutation.isPending
                            ? "加入中"
                            : "加入房间"}
                    </button>
                </section>
            </div>

            {room === undefined ? (
                <div className="empty-panel">
                    <DoorOpen size={24} />
                    <span>创建房间或输入房间号加入后查看房间状态</span>
                </div>
            ) : (
                <div className="room-panel">
                    <div className="room-code-box">
                        <div>
                            <span>房间号</span>
                            <strong>{room.roomCode}</strong>
                        </div>
                        <button
                            type="button"
                            className="secondary-button"
                            onClick={handleCopyRoomCode}
                        >
                            <Clipboard size={17} />
                            复制
                        </button>
                    </div>
                    <div className="room-summary">
                        <span>状态：{room.status}</span>
                        <span>
                            人数：{room.players.length}/{room.playerCount}
                        </span>
                        <span>
                            机器人补位：{room.botFillEnabled ? "开启" : "关闭"}
                        </span>
                        <span>{roomStatusMessage}</span>
                    </div>
                    <div className="room-members">
                        {room.players.map((player) => (
                            <div key={player.id} className="room-member">
                                <strong>{player.nickname ?? "玩家"}</strong>
                                <span>座位 {player.seat + 1}</span>
                                <span>{player.playerType}</span>
                                <span>
                                    {player.ready ? "已准备" : "未准备"}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="lobby-actions">
                        <span>
                            {joinedPlayer === undefined
                                ? "当前账号尚未在房间内"
                                : "当前账号已在房间内"}
                        </span>
                        <button
                            type="button"
                            className="secondary-button"
                            onClick={() => readyMutation.mutate()}
                            disabled={
                                !canSetReady ||
                                activeGameQuery.isLoading ||
                                readyMutation.isPending
                            }
                        >
                            {joinReady ? "设为已准备" : "取消准备"}
                        </button>
                        <label className="checkbox-field">
                            <input
                                type="checkbox"
                                checked={joinReady}
                                onChange={(event) =>
                                    setJoinReady(event.target.checked)
                                }
                                disabled={!canSetReady}
                            />
                            <span>准备状态</span>
                        </label>
                        <button
                            type="button"
                            className="secondary-button"
                            onClick={() => roomQuery.refetch()}
                            disabled={
                                roomId.length === 0 ||
                                roomQuery.isFetching ||
                                activeGameQuery.isLoading
                            }
                        >
                            <RefreshCw size={17} />
                            {roomQuery.isFetching ? "刷新中" : "刷新房间"}
                        </button>
                    </div>
                    <button
                        type="button"
                        className="primary-button"
                        onClick={() => startMutation.mutate()}
                        disabled={!canStartRoom || startMutation.isPending}
                    >
                        <Play size={18} />
                        {startMutation.isPending ? "开始中" : "开始对局"}
                    </button>
                </div>
            )}
            {copyMessage.length > 0 ? (
                <p className="text-sm text-emerald-300">{copyMessage}</p>
            ) : null}
            {currentError instanceof Error ? (
                <p className="text-sm text-rose-300">{currentError.message}</p>
            ) : null}
        </section>
    );
}

/**
 * 把房间内部状态转换成用户可理解的大厅提示。
 */
function resolveRoomStatusMessage(status: string | undefined): string {
    if (status === "OPEN") {
        return "等待成员准备";
    }
    if (status === "STARTED") {
        return "对局已开始";
    }
    if (status === "CLOSED") {
        return "房间已关闭";
    }
    return "尚未进入房间";
}
