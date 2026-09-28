/**
 * 登录注册页组件。
 *
 * 本文件负责最小账号入口，注册和登录成功后写入全局登录态。
 * 页面不保存密码，也不承担用户信息持久化，所有认证逻辑交给后端接口处理。
 */
import { useMutation } from "@tanstack/react-query";
import { LogIn, UserPlus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { login, register } from "../services/api";
import { useAuthStore } from "../stores/authStore";

/** 登录注册页签类型。 */
type AuthMode = "login" | "register";

/**
 * 渲染简单登录注册表单。
 */
export function AuthPage() {
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);
    const setSession = useAuthStore((state) => state.setSession);
    const [mode, setMode] = useState<AuthMode>("login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [nickname, setNickname] = useState("");

    /** 已登录用户再次进入登录页时直接回到大厅。 */
    useEffect(() => {
        if (user !== undefined) {
            navigate("/lobby", { replace: true });
        }
    }, [navigate, user]);

    /** 登录或注册请求，成功后进入大厅。 */
    const authMutation = useMutation({
        mutationFn: () =>
            mode === "login"
                ? login({ username, password })
                : register({
                      username,
                      password,
                      ...(nickname.trim().length === 0
                          ? {}
                          : { nickname: nickname.trim() }),
                  }),
        onSuccess: (session) => {
            setSession(session);
            navigate("/lobby", { replace: true });
        },
    });

    /**
     * 提交表单前做基础空值保护，详细规则仍以后端校验为准。
     */
    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        authMutation.mutate();
    }

    if (user !== undefined) {
        return <Navigate to="/lobby" replace />;
    }

    return (
        <section className="content-page auth-page">
            <div className="auth-panel">
                <div className="page-heading">
                    <h1>{mode === "login" ? "登录" : "注册"}</h1>
                    <p>登录后按个人账号查看最近对局和房间。</p>
                </div>
                <div className="segmented-control">
                    <button
                        type="button"
                        className={mode === "login" ? "active" : ""}
                        onClick={() => setMode("login")}
                    >
                        <LogIn size={16} />
                        登录
                    </button>
                    <button
                        type="button"
                        className={mode === "register" ? "active" : ""}
                        onClick={() => setMode("register")}
                    >
                        <UserPlus size={16} />
                        注册
                    </button>
                </div>
                <form className="auth-form" onSubmit={handleSubmit}>
                    <label className="form-field">
                        <span>账号</span>
                        <input
                            value={username}
                            onChange={(event) =>
                                setUsername(event.target.value)
                            }
                            minLength={3}
                            maxLength={32}
                            autoComplete="username"
                        />
                    </label>
                    <label className="form-field">
                        <span>密码</span>
                        <input
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            type="password"
                            minLength={6}
                            maxLength={72}
                            autoComplete={
                                mode === "login"
                                    ? "current-password"
                                    : "new-password"
                            }
                        />
                    </label>
                    {mode === "register" ? (
                        <label className="form-field">
                            <span>昵称</span>
                            <input
                                value={nickname}
                                onChange={(event) =>
                                    setNickname(event.target.value)
                                }
                                maxLength={32}
                            />
                        </label>
                    ) : null}
                    <button
                        type="submit"
                        className="primary-button"
                        disabled={
                            authMutation.isPending ||
                            username.trim().length < 3 ||
                            password.length < 6
                        }
                    >
                        {authMutation.isPending
                            ? "提交中"
                            : mode === "login"
                              ? "登录"
                              : "注册"}
                    </button>
                </form>
                {authMutation.error instanceof Error ? (
                    <p className="text-sm text-rose-300">
                        {authMutation.error.message}
                    </p>
                ) : null}
            </div>
        </section>
    );
}
