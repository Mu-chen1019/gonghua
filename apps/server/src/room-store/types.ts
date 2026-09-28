/**
 * 房间仓库类型模块。
 *
 * 本文件定义联机房间的读写边界，路由只依赖这些接口，不直接访问 Prisma。
 * 房间模块只管理成员和房间状态，不处理对局规则和牌面状态。
 */
import type { CreateRoomDTO, JoinRoomDTO, RoomDTO } from "@gonghua/contracts";

/**
 * 创建房间内部入参，路由层会把账号昵称补入，仓库层不直接依赖认证模块。
 */
export interface CreateStoredRoomInput extends CreateRoomDTO {
    ownerUserId: string; // 已经由路由层从登录态解析出的房主标识。
    ownerNickname?: string; // 房主账号昵称，仅用于房间成员展示兜底。
}

/**
 * 加入房间内部入参，昵称由服务端认证仓库解析后写入，公开接口不信任客户端昵称。
 */
export interface JoinStoredRoomInput extends JoinRoomDTO {
    userId: string; // 已经由路由层从登录态解析出的成员标识。
    nickname?: string; // 加入成员账号昵称，仅用于房间成员展示兜底。
}

/**
 * 房间准备状态更新入参。
 */
export interface SetRoomReadyInput {
    userId: string; // 用户唯一标识。
    ready: boolean; // 是否准备。
}

/**
 * 房间仓库接口。
 */
export interface RoomRepository {
    createRoom: (input: CreateStoredRoomInput) => Promise<RoomDTO>; // 创建房间并加入房主。
    getRoom: (roomId: string) => Promise<RoomDTO | undefined>; // 查询房间快照。
    joinRoom: (roomId: string, input: JoinStoredRoomInput) => Promise<RoomDTO>; // 加入房间。
    joinRoomByCode: (
        roomCode: string,
        input: JoinStoredRoomInput,
    ) => Promise<RoomDTO>; // 按房间号加入房间，供真实用户分享房间号使用。
    leaveRoom: (roomId: string, userId: string) => Promise<RoomDTO>; // 离开房间。
    setReady: (roomId: string, input: SetRoomReadyInput) => Promise<RoomDTO>; // 更新准备状态。
    markStarted: (roomId: string, currentGameId: string) => Promise<RoomDTO>; // 标记房间已经开始对局并记录当前对局入口。
    closeRoom: (roomId: string) => Promise<RoomDTO>; // 关闭房间。
}
