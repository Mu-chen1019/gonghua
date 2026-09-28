/**
 * 服务端启动入口，负责创建应用并监听本地开发端口。
 */
import { createApp } from "./app";
import { logServerAction } from "./logger";

/** 服务端监听端口，默认与前端代理配置保持一致。 */
const port = Number.parseInt(process.env.PORT ?? "3001", 10);

/** 服务端监听地址，默认允许本机和局域网访问。 */
const host = process.env.HOST ?? "0.0.0.0";

/** 已完成插件和路由注册的应用实例。 */
const app = await createApp();

await app.listen({ port, host });
logServerAction("server", "listen", { message: `http://${host}:${port}` });
