/**
 * Prisma 认证仓库模块。
 *
 * 本文件负责账号注册、登录校验、会话创建和会话查询。
 * 密码和会话令牌都只保存摘要，明文密码不落库，明文 token 只在登录或注册响应中返回一次。
 */
import {
    createHash,
    randomBytes,
    scrypt as scryptCallback,
    timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type {
    AuthSessionDTO,
    LoginDTO,
    RegisterDTO,
    UserDTO,
} from "@gonghua/contracts";
import { getPrismaClient } from "../db/prisma";
import type { AuthRepository } from "./types";

/** scrypt 的 Promise 版本，用于生成密码摘要。 */
const scrypt = promisify(scryptCallback);

/** 密码摘要长度。 */
const PASSWORD_KEY_LENGTH = 64;

/** 会话有效期，当前先按 30 天处理。 */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Prisma 实现的认证仓库。
 */
export class PrismaAuthRepository implements AuthRepository {
    /**
     * 注册用户并创建登录会话。
     */
    async register(input: RegisterDTO): Promise<AuthSessionDTO> {
        const prisma = getPrismaClient();
        const username = normalizeUsername(input.username);
        const passwordHash = await hashPassword(input.password);
        try {
            const user = await prisma.user.create({
                data: {
                    username,
                    passwordHash,
                    nickname: input.nickname?.trim() || username,
                },
            });
            return createSession(user);
        } catch (error) {
            if (isUniqueConstraintError(error)) {
                throw new Error("账号已存在", { cause: error });
            }
            throw error;
        }
    }

    /**
     * 校验账号密码并创建登录会话。
     */
    async login(input: LoginDTO): Promise<AuthSessionDTO> {
        const prisma = getPrismaClient();
        const username = normalizeUsername(input.username);
        const user = await prisma.user.findUnique({
            where: { username },
        });
        if (
            user === null ||
            user.passwordHash === null ||
            !(await verifyPassword(input.password, user.passwordHash))
        ) {
            throw new Error("账号或密码不正确");
        }
        return createSession(user);
    }

    /**
     * 根据明文会话令牌读取当前用户。
     */
    async getUserByToken(token: string): Promise<UserDTO | undefined> {
        const prisma = getPrismaClient();
        const session = await prisma.session.findUnique({
            where: { tokenHash: hashToken(token) },
            include: { user: true },
        });
        if (session === null || session.expiresAt.getTime() <= Date.now()) {
            return undefined;
        }
        return toUserDTO(session.user);
    }

    /**
     * 根据用户标识读取账号信息，创建对局时用于生成玩家展示名。
     */
    async getUserById(userId: string): Promise<UserDTO | undefined> {
        const prisma = getPrismaClient();
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });
        return user === null ? undefined : toUserDTO(user);
    }

    /**
     * 删除当前会话。
     */
    async logout(token: string): Promise<void> {
        const prisma = getPrismaClient();
        await prisma.session.deleteMany({
            where: { tokenHash: hashToken(token) },
        });
    }
}

/**
 * 创建登录会话并返回明文 token。
 */
async function createSession(user: {
    id: string;
    username: string | null;
    nickname: string;
    avatarUrl: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
}): Promise<AuthSessionDTO> {
    const prisma = getPrismaClient();
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await prisma.session.create({
        data: {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt,
        },
    });
    return {
        user: toUserDTO(user),
        token,
        expiresAt: expiresAt.toISOString(),
    };
}

/**
 * 生成密码摘要，格式为 `salt:hash`。
 */
async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derivedKey = (await scrypt(
        password,
        salt,
        PASSWORD_KEY_LENGTH,
    )) as Buffer;
    return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * 校验明文密码和摘要是否匹配。
 */
async function verifyPassword(
    password: string,
    passwordHash: string,
): Promise<boolean> {
    const [salt, hash] = passwordHash.split(":");
    if (salt === undefined || hash === undefined) {
        return false;
    }
    const storedKey = Buffer.from(hash, "hex");
    const derivedKey = (await scrypt(
        password,
        salt,
        storedKey.length,
    )) as Buffer;
    return (
        storedKey.length === derivedKey.length &&
        timingSafeEqual(storedKey, derivedKey)
    );
}

/**
 * 会话令牌摘要，避免数据库泄漏时直接暴露可用 token。
 */
function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/**
 * 标准化登录账号，当前统一用小写去空格。
 */
function normalizeUsername(username: string): string {
    return username.trim().toLowerCase();
}

/**
 * 判断 Prisma 唯一约束异常。
 */
function isUniqueConstraintError(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
    );
}

/**
 * 转换用户响应，确保不返回 passwordHash。
 */
function toUserDTO(user: {
    id: string;
    username: string | null;
    nickname: string;
    avatarUrl: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
}): UserDTO {
    return {
        id: user.id,
        ...(user.username === null ? {} : { username: user.username }),
        nickname: user.nickname,
        ...(user.avatarUrl === null ? {} : { avatarUrl: user.avatarUrl }),
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
    };
}
