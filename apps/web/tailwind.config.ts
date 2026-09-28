/**
 * 前端样式工具配置，负责扫描 H5 模板和源码中的样式类。
 */
import type { Config } from "tailwindcss";

export default {
    /** 样式类扫描范围，覆盖入口模板和前端源码。 */
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    /** 主题扩展配置，当前只统一无衬线字体栈。 */
    theme: {
        extend: {
            /** 前端默认字体栈，优先使用系统中文字体保证中文显示稳定。 */
            fontFamily: {
                sans: ["Inter", "PingFang SC", "Microsoft YaHei", "sans-serif"],
            },
        },
    },
    /** 当前暂未接入额外样式插件。 */
    plugins: [],
} satisfies Config;
