/**
 * 前端 Vite 配置，负责 React 插件和本地开发接口代理。
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    /** React 编译插件，支持当前 H5 前端页面开发。 */
    plugins: [react()],
    /** 开发服务器配置，统一把前端本地接口代理到后端服务。 */
    server: {
        proxy: {
            /** 对局接口代理，避免前端代码硬编码后端完整地址。 */
            "/api": {
                target: "http://localhost:3001",
                changeOrigin: true,
                /** 移除前端代理前缀，让后端直接接收真实业务路径。 */
                rewrite: (path) => path.replace(/^\/api/, ""),
            },
        },
    },
});
