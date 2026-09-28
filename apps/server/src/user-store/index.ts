/**
 * 用户配置仓库统一出口。
 *
 * 本文件根据当前数据库配置选择 Prisma 或空仓库实现，路由层只导入稳定函数。
 * 账号配置独立于对局仓库，避免后续个人页、账号体系和对局状态互相耦合。
 */
import { isDatabaseConfigured } from "../db/prisma";
import { NoopUserSettingRepository } from "./noopUserSettingRepository";
import { PrismaUserSettingRepository } from "./prismaUserSettingRepository";
export type { UpdateUserSettingInput, UserSettingRepository } from "./types";
export { NoopUserSettingRepository } from "./noopUserSettingRepository";
export { PrismaUserSettingRepository } from "./prismaUserSettingRepository";

/** 当前默认用户配置仓库，配置数据库后启用持久化。 */
const userSettingRepository = isDatabaseConfigured()
    ? new PrismaUserSettingRepository()
    : new NoopUserSettingRepository();

export const getStoredUserSetting = userSettingRepository.getUserSetting.bind(
    userSettingRepository,
);

export const updateStoredUserSetting =
    userSettingRepository.updateUserSetting.bind(userSettingRepository);
