/**
 * 用户配置仓库类型模块。
 *
 * 本文件定义用户个人配置的持久化边界，路由只依赖这里的接口，不直接感知 Prisma 或空实现。
 * `UserSettingRepository` 只负责账号配置读写，不承载游戏规则、对局状态和机器人决策逻辑。
 */
import type { UpdateUserSettingDTO, UserSettingDTO } from "@gonghua/contracts";

/**
 * 用户设置更新入参，沿用共享协议字段，便于后续前端个人页直接复用。
 */
export type UpdateUserSettingInput = UpdateUserSettingDTO;

/**
 * 用户配置仓库接口，数据库实现和无数据库实现必须保持同样响应语义。
 */
export interface UserSettingRepository {
    getUserSetting: (userId: string) => Promise<UserSettingDTO>; // 获取用户配置，不存在时返回默认配置。
    updateUserSetting: (
        userId: string,
        input: UpdateUserSettingInput,
    ) => Promise<UserSettingDTO>; // 更新用户配置，未传字段保持原值或默认值。
}
