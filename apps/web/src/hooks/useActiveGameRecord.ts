/**
 * 未结束对局查询 Hook。
 *
 * 本文件集中处理“当前用户是否已有未结束对局”的前端判断。
 * 后端当前只提供最近对局列表，未提供状态筛选参数，因此这里先查询最近一批记录后取第一条未结束对局。
 */
import { useQuery } from "@tanstack/react-query";
import type { GameRecordDTO } from "@gonghua/contracts";
import { listGameRecords } from "../services/api";

/** 已结束对局状态，当前与后端数据库 status 字符串保持一致。 */
const FINISHED_GAME_STATUS = "FINISHED";

/** 查询最近对局数量，避免只查 1 条时被已结束对局挡住未结束记录。 */
const ACTIVE_GAME_RECORD_LIMIT = 20;

/**
 * 查询当前用户最近一局未结束对局。
 */
export function useActiveGameRecord(userId: string | undefined) {
    return useQuery({
        queryKey: ["records", "active-game", userId],
        queryFn: async (): Promise<GameRecordDTO | null> => {
            if (userId === undefined) {
                return null;
            }
            const result = await listGameRecords({
                limit: ACTIVE_GAME_RECORD_LIMIT,
            });
            return (
                result.records.find(
                    (record) => record.status !== FINISHED_GAME_STATUS,
                ) ?? null
            );
        },
        enabled: userId !== undefined,
    });
}
