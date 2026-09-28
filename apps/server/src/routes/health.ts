/**
 * 健康检查路由模块。
 *
 * 本文件只负责服务存活检查，不承载业务状态和数据库读写。
 * 后续如果增加数据库或缓存健康检查，也应继续保留在 routes 层，由统一注册入口挂载。
 */
import type { FastifyInstance } from "fastify";
import { checkDatabaseHealth } from "../db/health";

/**
 * 注册服务健康检查接口。
 */
export async function registerHealthRoutes(
    app: FastifyInstance,
): Promise<void> {
    app.get("/health", async () => ({ status: "ok" }));
    app.get("/health/db", async () => {
        /** 数据库健康检查不影响基础存活检查，便于本地未配置数据库时继续开发。 */
        const database = await checkDatabaseHealth();
        return {
            status: database.ok ? "ok" : "unavailable",
            database,
        };
    });
}
