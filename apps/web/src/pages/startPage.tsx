/**
 * 开始页组件，负责创建首版本地对局、展示最近对局并跳转到对局页。
 */
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { History, Play, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createGame, listGameRecords } from "../services/api";
import { useAuthStore } from "../stores/authStore";

/** 已结束对局状态，当前与后端数据库 status 字符串保持一致。 */
const FINISHED_GAME_STATUS = "FINISHED";

/**
 * 渲染创建对局入口。
 */
export function StartPage() {
    /** 页面跳转函数，用于创建成功后进入指定对局。 */
    const navigate = useNavigate();
    /** 当前登录用户，作为首页创建和恢复对局的玩家视角来源。 */
    const user = useAuthStore((state) => state.user);
    /** 最近对局记录，用于提供继续对局入口。 */
    const recordsQuery = useQuery({
        queryKey: ["records", "games", user?.id],
        queryFn: () => listGameRecords(),
        enabled: user !== undefined,
    });
    /** 创建对局请求状态，成功后使用服务端返回的对局标识进入页面。 */
    const mutation = useMutation({
        mutationFn: () =>
            createGame({
                playerCount: 4,
            }),
        onSuccess: (data) => {
            navigate(`/game/${data.viewState.gameId}`);
        },
    });
    /** 未结束对局优先展示，避免用户需要去数据库页找 gameId。 */
    const activeRecords =
        recordsQuery.data?.records.filter(
            (record) => record.status !== FINISHED_GAME_STATUS,
        ) ?? [];

    if (user === undefined) {
        return null;
    }

    return (
        <section className="start-page">
            <div className="start-panel">
                <div>
                    <h1>攻花</h1>
                    <p className="start-subtitle">
                        {`当前账号：${user.nickname}`}
                    </p>
                </div>
                <button
                    type="button"
                    className="primary-button"
                    onClick={() => mutation.mutate()}
                    disabled={mutation.isPending}
                >
                    <Sparkles size={18} />
                    {mutation.isPending ? "创建中" : "创建对局"}
                </button>
                {mutation.error instanceof Error ? (
                    <p className="text-sm text-rose-300">
                        {mutation.error.message}
                    </p>
                ) : null}
                <section className="start-section">
                    <div className="section-title">
                        <History size={18} />
                        <h2>最近对局</h2>
                    </div>
                    {recordsQuery.isLoading ? (
                        <p className="muted-text">正在读取对局记录</p>
                    ) : activeRecords.length === 0 ? (
                        <p className="muted-text">暂无可继续对局</p>
                    ) : (
                        <div className="record-list">
                            {activeRecords.slice(0, 5).map((record) => (
                                <button
                                    key={record.id}
                                    type="button"
                                    className="record-item"
                                    onClick={() =>
                                        navigate(`/game/${record.id}`)
                                    }
                                >
                                    <span>
                                        <strong>{record.currentPhase}</strong>
                                        <small>
                                            版本 {record.stateVersion}
                                        </small>
                                    </span>
                                    <Play size={16} />
                                </button>
                            ))}
                        </div>
                    )}
                    {recordsQuery.error instanceof Error ? (
                        <p className="text-sm text-rose-300">
                            {recordsQuery.error.message}
                        </p>
                    ) : null}
                </section>
            </div>
        </section>
    );
}
