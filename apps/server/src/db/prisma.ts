/**
 * Prisma 客户端单例模块。
 *
 * 本文件只负责创建和复用 Prisma Client，仓库实现通过这里访问数据库。
 * 业务服务不能直接拼接 SQL 或散落创建客户端；后续测试或多环境切换也统一从这个入口处理。
 */
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * 全局 Prisma 缓存结构，开发环境热重载时避免重复创建连接。
 */
type PrismaGlobal = typeof globalThis & {
    prismaClient?: PrismaClient;
};

/** 全局对象上缓存的 Prisma Client 实例。 */
const prismaGlobal = globalThis as PrismaGlobal;

/** 本地后端环境变量文件路径，仅用于开发环境自动加载数据库连接。 */
const localEnvFilePath = fileURLToPath(new URL("../../.env", import.meta.url));

if (process.env.NODE_ENV !== "test" && existsSync(localEnvFilePath)) {
    loadEnvFile(localEnvFilePath);
}

/** PostgreSQL 连接地址，运行数据库相关能力时必须由环境变量提供。 */
const connectionString = process.env.DATABASE_URL;

/**
 * 创建 Prisma PostgreSQL 适配器，负责把 Prisma Client 连接到 node-postgres。
 */
function createPrismaClient(): PrismaClient {
    if (connectionString === undefined) {
        throw new Error("未配置 DATABASE_URL，无法创建 Prisma Client");
    }
    const adapter = new PrismaPg({ connectionString });
    return new PrismaClient({
        adapter,
        log:
            process.env.DB_LOG_QUERIES === "true"
                ? ["query", "error", "warn"]
                : ["error", "warn"],
    });
}

/**
 * 获取后端数据库客户端，所有 Prisma 仓库实现都应复用该实例。
 */
export function getPrismaClient(): PrismaClient {
    const prisma = prismaGlobal.prismaClient ?? createPrismaClient();
    if (process.env.NODE_ENV !== "production") {
        prismaGlobal.prismaClient = prisma;
    }
    return prisma;
}

/**
 * 判断当前进程是否配置了数据库连接，用于选择是否启用持久化仓库。
 */
export function isDatabaseConfigured(): boolean {
    return connectionString !== undefined;
}
