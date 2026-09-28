/**
 * 用户配置默认值模块。
 *
 * 本文件集中维护未落库或首次创建用户时使用的配置默认值，避免路由、空仓库和 Prisma 仓库各自散落默认值。
 */
import type { UpdateUserSettingDTO, UserSettingDTO } from "@gonghua/contracts";

/** 默认机器人等级，当前只保存配置值，不驱动机器人策略差异。 */
export const DEFAULT_BOT_LEVEL = "NORMAL";

/**
 * 创建指定用户的默认配置 DTO。
 */
export function createDefaultUserSetting(userId: string): UserSettingDTO {
    return {
        userId,
        autoSortEnabled: false,
        botLevel: DEFAULT_BOT_LEVEL,
        soundEnabled: true,
        animationEnabled: true,
        showEventPanel: true,
    };
}

/**
 * 把局部更新合并到默认配置上，用于无数据库模式和 Prisma 创建前兜底。
 */
export function mergeUserSetting(
    base: UserSettingDTO,
    input: UpdateUserSettingDTO,
): UserSettingDTO {
    return {
        ...base,
        ...input,
    };
}
