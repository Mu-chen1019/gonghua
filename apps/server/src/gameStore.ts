/**
 * 对局仓库兼容出口。
 *
 * 真实实现已经拆到 `src/game-store/` 目录：`types` 定义仓库边界，`memoryGameRepository` 提供内存实现，
 * `gameService` 负责编排核心规则调用。本文件只保留旧导入路径，避免路由层和后续代码受到迁移影响。
 */
export * from "./game-store";
