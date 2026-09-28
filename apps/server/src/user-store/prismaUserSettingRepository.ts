/**
 * Prisma 用户配置仓库模块。
 *
 * 本文件只负责 `UserSetting` 表的读写和 DTO 转换。
 * 首次读取或更新配置时会补齐本地用户主记录，避免外键不存在导致配置无法保存。
 */
import type { UserSettingDTO } from "@gonghua/contracts";
import { getPrismaClient } from "../db/prisma";
import {
    createDefaultUserSetting,
    mergeUserSetting,
} from "./defaultUserSetting";
import type { UpdateUserSettingInput, UserSettingRepository } from "./types";

/** 首次通过配置接口创建的本地用户默认昵称。 */
const DEFAULT_LOCAL_USER_NICKNAME = "本地玩家";

/**
 * Prisma 实现的用户配置仓库。
 */
export class PrismaUserSettingRepository implements UserSettingRepository {
    /**
     * 获取用户配置；如果用户或配置不存在，则创建默认用户和默认配置。
     */
    async getUserSetting(userId: string): Promise<UserSettingDTO> {
        await ensureLocalUser(userId);
        const prisma = getPrismaClient();
        const setting = await prisma.userSetting.upsert({
            where: { userId },
            update: {},
            create: {
                userId,
            },
        });
        return toUserSettingDTO(setting);
    }

    /**
     * 更新用户配置；未传字段不覆盖数据库当前值。
     */
    async updateUserSetting(
        userId: string,
        input: UpdateUserSettingInput,
    ): Promise<UserSettingDTO> {
        await ensureLocalUser(userId);
        const prisma = getPrismaClient();
        const setting = await prisma.userSetting.upsert({
            where: { userId },
            update: input,
            create: {
                ...mergeUserSetting(createDefaultUserSetting(userId), input),
                userId,
            },
        });
        return toUserSettingDTO(setting);
    }
}

/**
 * 确保配置归属用户存在，当前本地阶段使用默认昵称补齐用户主表。
 */
async function ensureLocalUser(userId: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: {
            id: userId,
            nickname: DEFAULT_LOCAL_USER_NICKNAME,
        },
    });
}

/**
 * 把 Prisma 用户配置记录转换为前后端共享 DTO。
 */
function toUserSettingDTO(record: {
    userId: string;
    autoSortEnabled: boolean;
    botLevel: string;
    soundEnabled: boolean;
    animationEnabled: boolean;
    showEventPanel: boolean;
    createdAt: Date;
    updatedAt: Date;
}): UserSettingDTO {
    return {
        userId: record.userId,
        autoSortEnabled: record.autoSortEnabled,
        botLevel: record.botLevel,
        soundEnabled: record.soundEnabled,
        animationEnabled: record.animationEnabled,
        showEventPanel: record.showEventPanel,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
    };
}
