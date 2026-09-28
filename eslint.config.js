/**
 * 全仓代码检查配置，负责 TypeScript、React Hooks 和刷新边界校验。
 */
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
    {
        /** 代码检查忽略目录，避免扫描构建产物和依赖目录。 */
        ignores: ["**/dist/**", "**/node_modules/**", "coverage/**"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        /** 当前规则块覆盖所有 TypeScript 和 React 组件文件。 */
        files: ["**/*.{ts,tsx}"],
        /** 语言环境配置，同时支持浏览器端和服务端全局变量。 */
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        /** React 相关插件配置。 */
        plugins: {
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        /** 项目级规则覆盖，当前禁止显式使用不安全的任意类型。 */
        rules: {
            ...reactHooks.configs.recommended.rules,
            "react-refresh/only-export-components": "off",
            "@typescript-eslint/no-explicit-any": "error",
        },
    },
];
