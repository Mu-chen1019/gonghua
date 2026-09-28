/**
 * 前端应用外壳，负责注册路由和全局导航，不承载对局规则判断。
 */
import type { ReactNode } from "react";
import {
    BrowserRouter,
    Link,
    Navigate,
    Route,
    Routes,
    useLocation,
} from "react-router-dom";
import { AuthPage } from "../pages/authPage";
import { GamePage } from "../pages/gamePage";
import { LobbyPage } from "../pages/lobbyPage";
import { ProfilePage } from "../pages/profilePage";
import { useAuthStore } from "../stores/authStore";

/**
 * 渲染 H5 应用的顶层路由结构。
 */
export function App() {
    return (
        <BrowserRouter>
            <AppShell />
        </BrowserRouter>
    );
}

/**
 * 应用布局外壳，对局页隐藏顶部导航，把屏幕空间优先留给牌桌和手牌。
 */
function AppShell() {
    const user = useAuthStore((state) => state.user);
    const location = useLocation();
    const isGamePage = location.pathname.startsWith("/game/");

    return (
        <div className="min-h-screen bg-[#10151f] text-slate-50">
            {isGamePage ? null : (
                <header className="fixed left-0 right-0 top-0 z-20 border-b border-white/10 bg-[#10151f]/90 backdrop-blur">
                    <nav className="mx-auto flex h-14 max-w-6xl items-center justify-end px-4">
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                            {user === undefined ? null : (
                                <>
                                    <Link
                                        className="rounded-md px-3 py-2 hover:bg-white/10"
                                        to="/lobby"
                                    >
                                        大厅
                                    </Link>
                                    <Link
                                        className="rounded-md px-3 py-2 hover:bg-white/10"
                                        to="/profile"
                                    >
                                        {user.nickname}
                                    </Link>
                                </>
                            )}
                        </div>
                    </nav>
                </header>
            )}
            <main className={isGamePage ? "" : "pt-14"}>
                <Routes>
                    <Route
                        path="/"
                        element={
                            user === undefined ? (
                                <Navigate to="/auth" replace />
                            ) : (
                                <Navigate to="/lobby" replace />
                            )
                        }
                    />
                    <Route path="/auth" element={<AuthPage />} />
                    <Route
                        path="/game/:gameId"
                        element={
                            <RequireAuth>
                                <GamePage />
                            </RequireAuth>
                        }
                    />
                    <Route
                        path="/lobby"
                        element={
                            <RequireAuth>
                                <LobbyPage />
                            </RequireAuth>
                        }
                    />
                    <Route
                        path="/profile"
                        element={
                            <RequireAuth>
                                <ProfilePage />
                            </RequireAuth>
                        }
                    />
                </Routes>
            </main>
        </div>
    );
}

/**
 * 登录保护路由，未登录时统一跳转登录页，避免业务页面重复显示登录按钮。
 */
function RequireAuth({ children }: { children: ReactNode }) {
    const user = useAuthStore((state) => state.user);
    if (user === undefined) {
        return <Navigate to="/auth" replace />;
    }
    return children;
}
