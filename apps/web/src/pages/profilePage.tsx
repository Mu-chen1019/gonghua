/**
 * 个人页组件。
 *
 * 本文件展示当前登录用户基础信息，并提供登出入口。
 * 个人配置和战绩详情仍由后续个人页阶段继续扩展。
 */
import { useMutation } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useActiveGameRecord } from "../hooks/useActiveGameRecord";
import { logout } from "../services/api";
import { useAuthStore } from "../stores/authStore";

/**
 * 渲染个人账号信息。
 */
export function ProfilePage() {
    const navigate = useNavigate();
    const session = useAuthStore((state) => state.session);
    const user = useAuthStore((state) => state.user);
    const clearSession = useAuthStore((state) => state.clearSession);
    /** 当前用户最近一局未结束对局，用于个人信息下方快速恢复。 */
    const activeGameQuery = useActiveGameRecord(user?.id);

    /** 登出当前会话，接口失败时也清空本地登录态，避免用户卡在过期 token。 */
    const logoutMutation = useMutation({
        mutationFn: () =>
            session === undefined
                ? Promise.resolve({ success: true })
                : logout(session.token),
        onSettled: () => {
            clearSession();
            navigate("/auth", { replace: true });
        },
    });

    if (user === undefined) {
        return null;
    }
    const activeGame = activeGameQuery.data;

    return (
        <section className="content-page profile-page">
            <div className="page-heading">
                <h1>个人</h1>
                <p>账号信息已用于首页最近对局和房间归属。</p>
            </div>
            <div className="profile-panel">
                <span>账号：{user.username ?? "未设置"}</span>
                <span>昵称：{user.nickname}</span>
                <span>状态：{user.status}</span>
            </div>
            <section className="profile-panel">
                <strong>最近未结束对局</strong>
                {activeGameQuery.isLoading ? (
                    <span>正在读取对局记录</span>
                ) : activeGame === undefined || activeGame === null ? (
                    <span>暂无未结束对局</span>
                ) : (
                    <button
                        type="button"
                        className="record-item"
                        onClick={() => navigate(`/game/${activeGame.id}`)}
                    >
                        <span>
                            <strong>{activeGame.currentPhase}</strong>
                            <small>版本 {activeGame.stateVersion}</small>
                        </span>
                        进入
                    </button>
                )}
                {activeGameQuery.error instanceof Error ? (
                    <span className="text-sm text-rose-300">
                        {activeGameQuery.error.message}
                    </span>
                ) : null}
            </section>
            <button
                type="button"
                className="secondary-button"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
            >
                <LogOut size={17} />
                {logoutMutation.isPending ? "退出中" : "退出登录"}
            </button>
        </section>
    );
}
