/**
 * 服务端应用创建模块，集中注册跨域、健康检查和业务路由。
 */
import cors from "@fastify/cors";
import Fastify from "fastify";
import { registerRoutes } from "./routes";

/**
 * 创建 Fastify 应用实例，并完成所有服务端插件和路由注册。
 */
export async function createApp() {
    /** 服务端应用实例，首版关闭框架内置日志，统一使用业务日志输出。 */
    const app = Fastify({ logger: false });
    await app.register(cors, {
        origin: true,
    });
    await registerRoutes(app);
    return app;
}
