/**
 * 房间仓库统一出口。
 *
 * 本文件按数据库配置选择 Prisma 或内存房间仓库，路由层只使用稳定函数。
 * 房间能力独立于对局状态仓库，后续联机时再与开始对局流程衔接。
 */
import { isDatabaseConfigured } from "../db/prisma";
import { MemoryRoomRepository } from "./memoryRoomRepository";
import { PrismaRoomRepository } from "./prismaRoomRepository";
export type { RoomRepository, SetRoomReadyInput } from "./types";
export { MemoryRoomRepository } from "./memoryRoomRepository";
export { PrismaRoomRepository } from "./prismaRoomRepository";

/** 当前默认房间仓库，配置数据库后持久化到 PostgreSQL。 */
const roomRepository = isDatabaseConfigured()
    ? new PrismaRoomRepository()
    : new MemoryRoomRepository();

export const createStoredRoom = roomRepository.createRoom.bind(roomRepository);

export const getStoredRoom = roomRepository.getRoom.bind(roomRepository);

export const joinStoredRoom = roomRepository.joinRoom.bind(roomRepository);

export const joinStoredRoomByCode =
    roomRepository.joinRoomByCode.bind(roomRepository);

export const leaveStoredRoom = roomRepository.leaveRoom.bind(roomRepository);

export const setStoredRoomReady = roomRepository.setReady.bind(roomRepository);

export const markStoredRoomStarted =
    roomRepository.markStarted.bind(roomRepository);

export const closeStoredRoom = roomRepository.closeRoom.bind(roomRepository);
