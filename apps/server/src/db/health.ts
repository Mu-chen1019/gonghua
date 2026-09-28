/**
 * 数据库健康检查模块。
 *
 * 本文件只提供数据库连接探测能力，供健康检查路由或启动检查调用。
 * 探测失败不会在这里退出进程，是否把数据库状态作为强依赖由调用方决定。
 */
import { getPrismaClient } from "./prisma";

/**
 * 数据库健康检查结果。
 */
export interface DatabaseHealthResult {
    ok: boolean; // 数据库是否可连接。
    message: string; // 中文检查结果说明。
}

/**
 * 探测 PostgreSQL 是否可连接。
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
    if (process.env.DATABASE_URL === undefined) {
        return { ok: false, message: "未配置 DATABASE_URL" };
    }
    try {
        const prisma = getPrismaClient();
        await prisma.$queryRaw`SELECT 1`;
        return { ok: true, message: "数据库连接正常" };
    } catch (error) {
        return {
            ok: false,
            message:
                error instanceof Error
                    ? `数据库连接失败：${error.message}`
                    : "数据库连接失败",
        };
    }
}
