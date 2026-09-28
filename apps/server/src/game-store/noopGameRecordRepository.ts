/**
 * 空对局记录仓库模块。
 *
 * 本文件提供未配置数据库时的安全实现，让本地开发和测试环境继续只使用内存对局仓库。
 * 配置 `DATABASE_URL` 后，默认出口会切换到 Prisma 实现。
 */
import type { GameRecordDTO, GameResultDTO } from "@gonghua/contracts";
import type { GameRecordRepository } from "./types";

/**
 * 未配置数据库时使用的空实现，不读写任何持久化数据。
 */
export class NoopGameRecordRepository implements GameRecordRepository {
    /**
     * 跳过本地用户写入，避免未配置数据库时影响创建对局。
     */
    async upsertLocalUser(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * 跳过对局主记录创建，权威运行态仍保存在内存仓库。
     */
    async createGameRecord(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * 跳过对局主记录更新，权威运行态仍保存在内存仓库。
     */
    async updateGameRecord(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * 跳过主动结束对局记录，未配置数据库时只依赖内存状态结束本局。
     */
    async finishGameRecord(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * 跳过对局玩家关系同步，未配置数据库时不影响运行中对局。
     */
    async syncGamePlayers(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * 未配置数据库时没有持久化对局结果。
     */
    async getGameResult(): Promise<GameResultDTO | undefined> {
        return Promise.resolve(undefined);
    }

    /**
     * 未配置数据库时返回空列表，避免记录接口影响基础游戏流程。
     */
    async listGameRecords(): Promise<GameRecordDTO[]> {
        return Promise.resolve([]);
    }
}
