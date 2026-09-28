/**
 * Prisma 对局记录仓库测试。
 *
 * 本文件只覆盖仓库入参构造等纯逻辑，不连接真实数据库。
 * 重点保证对局内展示名不会覆盖账号主表中的真人昵称。
 */
import { describe, expect, it } from "vitest";
import { PlayerStatus, PlayerType } from "@gonghua/contracts";
import type { PlayerState } from "@gonghua/game-core";
import {
    toUserCreateInput,
    toUserUpdateInput,
} from "./prismaGameRecordRepository";

describe("prismaGameRecordRepository", () => {
    it("真人玩家更新用户时不会覆盖账号昵称", () => {
        const player = createPlayer({
            playerType: PlayerType.HUMAN,
            name: "我",
        });

        expect(toUserUpdateInput(player)).toEqual({});
    });

    it("机器人玩家更新用户时允许同步机器人展示名", () => {
        const player = createPlayer({
            playerType: PlayerType.BOT,
            name: "机器人2",
        });

        expect(toUserUpdateInput(player)).toEqual({
            nickname: "机器人2",
        });
    });

    it("新建用户时仍写入默认展示昵称", () => {
        const player = createPlayer({
            playerType: PlayerType.HUMAN,
            name: "临时玩家",
        });

        expect(toUserCreateInput(player)).toMatchObject({
            id: "player-1",
            nickname: "临时玩家",
        });
    });
});

/**
 * 创建最小玩家状态，避免测试关注牌面数据。
 */
function createPlayer(input: {
    playerType: PlayerType;
    name: string;
}): PlayerState {
    return {
        playerId: "player-1",
        seat: 0,
        name: input.name,
        playerType: input.playerType,
        isBot: input.playerType === PlayerType.BOT,
        status: PlayerStatus.ACTIVE,
        handCards: [],
    };
}
