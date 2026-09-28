/**
 * 前端样式构建配置，负责接入 Tailwind 和浏览器前缀处理。
 */
module.exports = {
    /** PostCSS 插件列表，顺序会影响最终样式处理结果。 */
    plugins: {
        /** Tailwind 样式处理插件。 */
        "@tailwindcss/postcss": {},
        /** 自动补齐必要浏览器前缀。 */
        autoprefixer: {},
    },
};
