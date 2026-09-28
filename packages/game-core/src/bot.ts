/**
 * 机器人策略兼容出口。
 *
 * 真实机器人逻辑已经拆到 `src/bot/` 目录，本文件只保留旧导入路径的转发能力。
 * 现有 `gameplay/botStep` 和外部包出口可继续从 `./bot` 读取能力，后续新策略直接放入 `src/bot/`。
 */
export * from "./bot/index";
