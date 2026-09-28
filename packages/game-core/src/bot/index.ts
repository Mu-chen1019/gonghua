/**
 * 机器人模块统一出口。
 *
 * 本文件集中导出机器人策略相关能力，让外部继续从 `bot` 模块读取 `findNextBotActor` 和 `selectBotAction`。
 * 具体默认策略在 `ruleBot`，选牌工具在 `cardPicker`，策略类型在 `types`；
 * 后续新增分级机器人时优先在本目录扩展，不把策略继续堆回状态机入口。
 */
export * from "./types";
export * from "./cardPicker";
export * from "./ruleBot";
