# 服务端路由索引

## 1. 目标

- 让开发者可以从一个地方快速找到接口路径、路由文件和业务入口。
- 保持“路由实现分文件、注册入口统一”的结构，避免后续接口堆到单个文件里。
- 新增接口时必须先确认归属模块，再把注册动作补到 `apps/server/src/routes/index.ts`。

## 2. 当前路由

| 方法 | 路径                      | 文件                               | 说明               |
| ---- | ------------------------- | ---------------------------------- | ------------------ |
| GET  | `/health`                 | `apps/server/src/routes/health.ts` | 服务健康检查       |
| POST | `/games`                  | `apps/server/src/routes/games.ts`  | 创建对局           |
| GET  | `/games/:gameId`          | `apps/server/src/routes/games.ts`  | 获取对局视角       |
| POST | `/games/:gameId/actions`  | `apps/server/src/routes/games.ts`  | 提交玩家动作       |
| POST | `/games/:gameId/bot-step` | `apps/server/src/routes/games.ts`  | 推进一个机器人动作 |

## 3. 新增接口规则

1. 新接口先放到对应业务路由文件，不要直接写进 `app.ts`。
2. 如果业务域是新的，先新建 `apps/server/src/routes/<domain>.ts`。
3. 新路由文件创建后，必须同步在 `apps/server/src/routes/index.ts` 注册。
4. 如果接口会被前端调用，最好同步补一条这里的路由索引。
