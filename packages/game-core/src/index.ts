/**
 * 游戏核心包统一出口，供服务端和测试按模块边界复用纯逻辑能力。
 */
export * from "./model";
export * from "./deck";
export * from "./rules";
export * from "./engine";
export * from "./view";
export * from "./logger";
export * from "./bot";
export * from "./legalActions";
export * from "./gameplay/actionPhase";
export * from "./gameplay/attackActions";
export type { BotActionApplier } from "./gameplay/botStep";
export * from "./gameplay/gameProgress";
export * from "./gameplay/gameSetup";
export * from "./gameplay/roundSettlement";
export * from "./gameplay/defenseActions";
export * from "./gameplay/stateUtils";
export * from "./gameplay/trumpExchange";
export * from "./gameplay/trumpRules";
