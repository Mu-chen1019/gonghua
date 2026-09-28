/**
 * 认证仓库类型模块。
 *
 * 本文件定义登录注册和会话查询的最小仓库接口，路由层不直接访问 Prisma，也不处理密码摘要细节。
 */
import type {
    AuthSessionDTO,
    LoginDTO,
    RegisterDTO,
    UserDTO,
} from "@gonghua/contracts";

/**
 * 认证仓库接口。
 */
export interface AuthRepository {
    register: (input: RegisterDTO) => Promise<AuthSessionDTO>; // 注册用户并创建登录会话。
    login: (input: LoginDTO) => Promise<AuthSessionDTO>; // 校验账号密码并创建登录会话。
    getUserById: (userId: string) => Promise<UserDTO | undefined>; // 根据用户标识读取账号信息。
    getUserByToken: (token: string) => Promise<UserDTO | undefined>; // 根据明文会话令牌读取当前用户。
    logout: (token: string) => Promise<void>; // 删除当前会话。
}
