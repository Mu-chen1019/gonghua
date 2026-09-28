/**
 * 前端登录态仓库。
 *
 * 本文件只保存当前用户会话和本地持久化，不负责调用登录注册接口，也不参与游戏规则判断。
 */
import type { AuthSessionDTO, UserDTO } from "@gonghua/contracts";
import { create } from "zustand";

/** 本地保存登录态的键名，值中包含 token，禁止写入日志。 */
const AUTH_STORAGE_KEY = "gonghua.auth.session";

/**
 * 前端认证状态结构。
 */
interface AuthState {
    session: AuthSessionDTO | undefined; // 当前登录会话，未登录时为空。
    user: UserDTO | undefined; // 当前用户基础信息，便于页面直接读取。
    setSession: (session: AuthSessionDTO) => void; // 写入新的登录会话。
    setUser: (user: UserDTO) => void; // 刷新当前用户基础信息。
    clearSession: () => void; // 清空登录会话。
}

/**
 * 全局登录态仓库，页面通过它读取当前账号视角。
 */
export const useAuthStore = create<AuthState>((set, get) => {
    const storedSession = readStoredSession();
    return {
        session: storedSession,
        user: storedSession?.user,
        setSession: (session) => {
            window.localStorage.setItem(
                AUTH_STORAGE_KEY,
                JSON.stringify(session),
            );
            set({ session, user: session.user });
        },
        setUser: (user) => {
            const session = get().session;
            if (session === undefined) {
                set({ user });
                return;
            }
            const nextSession = { ...session, user };
            window.localStorage.setItem(
                AUTH_STORAGE_KEY,
                JSON.stringify(nextSession),
            );
            set({ session: nextSession, user });
        },
        clearSession: () => {
            window.localStorage.removeItem(AUTH_STORAGE_KEY);
            set({ session: undefined, user: undefined });
        },
    };
});

/**
 * 从 localStorage 读取会话，解析失败或过期时主动清空，避免页面使用无效登录态。
 */
function readStoredSession(): AuthSessionDTO | undefined {
    const rawSession = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (rawSession === null) {
        return undefined;
    }
    try {
        const session = JSON.parse(rawSession) as AuthSessionDTO;
        if (new Date(session.expiresAt).getTime() <= Date.now()) {
            window.localStorage.removeItem(AUTH_STORAGE_KEY);
            return undefined;
        }
        return session;
    } catch {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        return undefined;
    }
}
