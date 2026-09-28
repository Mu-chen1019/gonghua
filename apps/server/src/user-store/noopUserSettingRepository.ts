/**
 * 空用户配置仓库模块。
 *
 * 本文件用于未配置数据库的开发和测试环境：接口仍返回稳定默认值，但不会持久保存配置。
 * 这样数据库接入不会阻断当前单机对局和基础路由测试。
 */
import type { UserSettingDTO } from "@gonghua/contracts";
import {
    createDefaultUserSetting,
    mergeUserSetting,
} from "./defaultUserSetting";
import type { UpdateUserSettingInput, UserSettingRepository } from "./types";

/**
 * 未配置数据库时使用的用户配置空实现。
 */
export class NoopUserSettingRepository implements UserSettingRepository {
    /**
     * 返回默认用户配置，不读取持久化数据。
     */
    async getUserSetting(userId: string): Promise<UserSettingDTO> {
        return Promise.resolve(createDefaultUserSetting(userId));
    }

    /**
     * 返回本次更新后的配置视图，但不会写入持久化存储。
     */
    async updateUserSetting(
        userId: string,
        input: UpdateUserSettingInput,
    ): Promise<UserSettingDTO> {
        return Promise.resolve(
            mergeUserSetting(createDefaultUserSetting(userId), input),
        );
    }
}
