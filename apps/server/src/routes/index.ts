/**
 * 服务端路由统一注册入口。
 *
 * 本文件维护所有 HTTP 路由模块的注册顺序和目录索引，方便后续新增接口时只需要补一个路由模块并在这里挂载。
 * 业务逻辑仍然拆分在各自路由文件中，不把所有接口堆进单个文件。
 */
import type { FastifyInstance } from "fastify";
import { registerAuthRoutes } from "./auth";
import { registerGameRoutes } from "./games";
import { registerHealthRoutes } from "./health";
import { registerRecordRoutes } from "./records";
import { registerRoomRoutes } from "./rooms";
import { registerUserRoutes } from "./users";

/**
 * 注册当前服务端全部 HTTP 路由。
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
    await registerHealthRoutes(app);
    await registerAuthRoutes(app);
    await registerGameRoutes(app);
    await registerRecordRoutes(app);
    await registerRoomRoutes(app);
    await registerUserRoutes(app);
}
