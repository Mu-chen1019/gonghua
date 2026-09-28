/**
 * 认证仓库统一出口。
 *
 * 本文件根据数据库配置选择 Prisma 或内存认证仓库，让路由层保持稳定导入。
 */
import { isDatabaseConfigured } from "../db/prisma";
import { MemoryAuthRepository } from "./memoryAuthRepository";
import { PrismaAuthRepository } from "./prismaAuthRepository";

export type { AuthRepository } from "./types";
export { MemoryAuthRepository } from "./memoryAuthRepository";
export { PrismaAuthRepository } from "./prismaAuthRepository";

/** 当前认证仓库，数据库可用时使用持久化实现。 */
const authRepository = isDatabaseConfigured()
    ? new PrismaAuthRepository()
    : new MemoryAuthRepository();

export const registerUser = authRepository.register.bind(authRepository);
export const loginUser = authRepository.login.bind(authRepository);
export const getUserById = authRepository.getUserById.bind(authRepository);
export const getUserByToken =
    authRepository.getUserByToken.bind(authRepository);
export const logoutUser = authRepository.logout.bind(authRepository);
