/**
 * 内存认证仓库模块。
 *
 * 本文件用于未配置数据库时维持登录注册接口可用，只服务本地开发，不提供跨进程持久化。
 */
import { randomUUID } from "node:crypto";
import type {
    AuthSessionDTO,
    LoginDTO,
    RegisterDTO,
    UserDTO,
} from "@gonghua/contracts";
import type { AuthRepository } from "./types";

/**
 * 内存实现的认证仓库。
 */
export class MemoryAuthRepository implements AuthRepository {
    /** 账号到用户和密码的内存索引。 */
    private readonly users = new Map<string, UserDTO & { password: string }>();
    /** 明文 token 到用户标识的内存索引，仅用于本地无数据库开发。 */
    private readonly sessions = new Map<string, string>();

    /**
     * 注册内存用户并创建会话。
     */
    async register(input: RegisterDTO): Promise<AuthSessionDTO> {
        const username = input.username.trim().toLowerCase();
        if (this.users.has(username)) {
            throw new Error("账号已存在");
        }
        const now = new Date().toISOString();
        const user = {
            id: randomUUID(),
            username,
            nickname: input.nickname?.trim() || username,
            status: "ACTIVE",
            createdAt: now,
            updatedAt: now,
            password: input.password,
        };
        this.users.set(username, user);
        return this.createSession(user);
    }

    /**
     * 校验内存用户密码并创建会话。
     */
    async login(input: LoginDTO): Promise<AuthSessionDTO> {
        const username = input.username.trim().toLowerCase();
        const user = this.users.get(username);
        if (user === undefined || user.password !== input.password) {
            throw new Error("账号或密码不正确");
        }
        return this.createSession(user);
    }

    /**
     * 根据 token 查询当前用户。
     */
    async getUserByToken(token: string): Promise<UserDTO | undefined> {
        const username = this.sessions.get(token);
        if (username === undefined) {
            return undefined;
        }
        const user = this.users.get(username);
        return user === undefined ? undefined : toPublicUser(user);
    }

    /**
     * 根据用户标识查询内存用户，供创建对局时读取账号昵称。
     */
    async getUserById(userId: string): Promise<UserDTO | undefined> {
        const user = Array.from(this.users.values()).find(
            (item) => item.id === userId,
        );
        return user === undefined ? undefined : toPublicUser(user);
    }

    /**
     * 删除内存会话。
     */
    async logout(token: string): Promise<void> {
        this.sessions.delete(token);
    }

    /**
     * 创建内存会话响应。
     */
    private createSession(
        user: UserDTO & { password: string },
    ): AuthSessionDTO {
        const token = randomUUID();
        const expiresAt = new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString();
        this.sessions.set(token, user.username ?? user.id);
        return {
            user: toPublicUser(user),
            token,
            expiresAt,
        };
    }
}

/**
 * 去掉内存密码字段后返回给前端。
 */
function toPublicUser(user: UserDTO & { password: string }): UserDTO {
    return {
        id: user.id,
        ...(user.username === undefined ? {} : { username: user.username }),
        nickname: user.nickname,
        ...(user.avatarUrl === undefined ? {} : { avatarUrl: user.avatarUrl }),
        status: user.status,
        ...(user.createdAt === undefined ? {} : { createdAt: user.createdAt }),
        ...(user.updatedAt === undefined ? {} : { updatedAt: user.updatedAt }),
    };
}
