# 攻花 H5 项目数据库阶段步骤

## 1. 文档目标

- 本文档集中维护数据库建设计划，包括已建表、待建表、迁移命令、数据写入时机和数据库功能规划。
- 后端功能阶段只描述服务、接口和业务编排；涉及建表、迁移和数据落库细节时，以本文档为准。
- 后续只要 `apps/server/prisma/schema.prisma` 新增、删除或调整表字段，必须同步更新本文档和 `docs/数据库表字段说明.md`。
- 当前数据库使用 `PostgreSQL + Prisma`，运行中高频状态短期仍保存在服务端内存仓库。

## 2. 当前数据库状态

- [x] 本地 PostgreSQL 已准备开发库、测试库和 shadow 库。
- [x] 已接入 Prisma 7 配置文件：`apps/server/prisma.config.ts`。
- [x] 已新增 Prisma schema：`apps/server/prisma/schema.prisma`。
- [x] 已新增 Prisma Client 入口：`apps/server/src/db/prisma.ts`。
- [x] 已新增数据库健康检查：`GET /health/db`。
- [x] 已新增 `.env.example`，真实 `.env` 不提交。
- [x] 已新增 Prisma Studio 脚本：`pnpm --filter @gonghua/server run db:studio`。
- [x] 已新增根目录数据库常用脚本：`pnpm run dev:server:db`、`pnpm run db:health`、`pnpm run db:studio`。
- [x] Prisma CLI 配置会自动加载 `apps/server/.env`，无需手动 `source` 后再打开 Studio。
- [x] 已新增数据库字段说明文档：`docs/数据库表字段说明.md`。
- [x] 已新增账号字段和会话表，支持登录注册最小闭环。

## 3. 已建表

### 3.1 User 用户主表

- [x] 已建表。
- [x] 已通过迁移 `20260904075718_init_minimal_user_game` 创建。
- [x] 已通过迁移 `20260907091500_add_auth_user_session` 增加 `username`、`passwordHash` 和会话关系。
- [x] 创建对局时会补齐当前本地用户。
- [x] 创建对局时会补齐临时机器人用户。
- [x] 登录注册时会写入真实账号，并用真实用户标识关联房间和对局。

用途：

- 保存玩家账号或本地访客用户的基础展示信息。
- 承载登录注册后的真实用户身份资料。

### 3.2 Session 用户会话表

- [x] 已建表。
- [x] 已通过迁移 `20260907091500_add_auth_user_session` 创建。
- [x] 注册和登录成功后写入会话 token 摘要。
- [x] `GET /auth/me` 可通过 Bearer token 查询当前用户。
- [x] `POST /auth/logout` 可删除当前会话。

用途：

- 保存用户登录会话的 token 摘要和过期时间。
- 明文 token 不入库，只返回给前端本地会话使用。

### 3.3 Game 对局主表

- [x] 已建表。
- [x] 已通过迁移 `20260904075718_init_minimal_user_game` 创建。
- [x] `POST /games` 创建对局时写入对局主记录。
- [x] 玩家或机器人动作成功后更新 `currentPhase`、`status` 和 `stateVersion`。
- [x] 已通过迁移 `20260907143000_add_game_mode_finish_reason` 增加 `mode` 和 `finishReason`。
- [x] 人机模式退出或重新开始时，旧局会写入 `FINISHED`、`finishedAt` 和 `finishReason`。

用途：

- 保存一局游戏的基础生命周期信息。
- 区分普通对局和单人人机对局。
- 区分正常结算结束、主动退出结束和重新开始结束。
- 当前不保存完整运行中牌面状态。

### 3.4 UserSetting 用户个人配置表

- [x] 已建表。
- [x] 已通过迁移 `20260907014126_add_user_settings` 创建。
- [x] 已实现 `GET /users/:userId/settings`。
- [x] 已实现 `PUT /users/:userId/settings`。
- [x] 未配置数据库时有空仓库默认值兜底。

用途：

- 保存手牌自动排序、机器人默认等级、音效、动画和事件栏显示偏好。
- 当前只保存配置，不参与游戏规则判断。

### 3.5 GamePlayer 对局玩家关系表

- [x] 已建表。
- [x] 已通过迁移 `20260907015723_add_game_players` 创建。
- [x] 创建对局时同步写入所有玩家座位关系。
- [x] 玩家产生名次后同步写入 `finalRank` 和 `finishedAt`。

用途：

- 保存一局对局中每个座位对应的用户。
- 区分真人玩家和机器人玩家。
- 为对局记录、个人战绩、机器人账号化打基础。

## 4. 本次补齐表

### 4.1 GameResult 对局结果表

- [x] 已建表。
- [x] 已通过迁移 `20260907024052_add_remaining_database_tables` 创建。
- [x] 已实现对局第一次进入 `GAME_OVER` 时写入结果。
- [x] 已实现对局结果查询接口：`GET /games/:gameId/result`。

建议字段：

- `id`：结果唯一标识。
- `gameId`：对局唯一标识，唯一关联 `Game.id`。
- `winnerUserId`：第一名用户标识。
- `rankingsJson`：完整排名 JSON。
- `scoreJson`：计分 JSON，预留后续计分规则。
- `createdAt`：创建时间。

### 4.2 GameAction 对局动作日志表

- [x] 已建表。
- [x] 已通过迁移 `20260907024052_add_remaining_database_tables` 创建。
- [x] 已实现玩家动作日志。
- [x] 已实现机器人动作日志。
- [x] 已实现系统事件日志兜底。
- [x] 已实现失败动作日志。
- [x] 已实现按对局查询动作日志接口：`GET /games/:gameId/actions`。

建议字段：

- `id`：动作日志标识。
- `gameId`：对局标识。
- `clientActionId`：客户端动作幂等标识。
- `playerId`：玩家标识，可为空表示系统动作。
- `seat`：座位号。
- `actorType`：动作来源，真人、机器人或系统。
- `actionType`：动作类型。
- `payloadJson`：动作参数 JSON。
- `beforeVersion`：动作前版本。
- `afterVersion`：动作后版本。
- `success`：是否成功。
- `errorCode`：失败错误码。
- `errorMessage`：失败中文说明。
- `eventJson`：动作产生的事件 JSON。
- `createdAt`：创建时间。

### 4.3 GameSnapshot 对局快照表

- [x] 已建表。
- [x] 已通过迁移 `20260907024052_add_remaining_database_tables` 创建。
- [x] 已实现创建对局和成功动作后的最新状态快照。
- [x] 已实现内存状态缺失时从最新快照按需恢复。
- [x] 已实现快照最小结构校验。

建议字段：

- `id`：快照标识。
- `gameId`：对局标识。
- `stateVersion`：状态版本号。
- `stateJson`：完整 `GameState` JSON。
- `createdAt`：创建时间。

### 4.4 Room 房间主表

- [x] 已建表。
- [x] 已通过迁移 `20260907024052_add_remaining_database_tables` 创建。
- [x] 已实现房间创建、关闭和查询。
- [x] 已提供联机房间流程的数据基础。

建议字段：

- `id`：房间标识。
- `roomCode`：房间号。
- `ownerUserId`：房主用户标识。
- `status`：房间状态。
- `playerCount`：目标玩家数量。
- `botFillEnabled`：是否允许机器人补位。
- `createdAt`：创建时间。
- `updatedAt`：更新时间。
- `closedAt`：关闭时间。

### 4.5 RoomPlayer 房间玩家关系表

- [x] 已建表。
- [x] 已通过迁移 `20260907024052_add_remaining_database_tables` 创建。
- [x] 已实现加入房间、离开房间、准备状态和在线状态。

建议字段：

- `id`：记录标识。
- `roomId`：房间标识。
- `userId`：用户标识。
- `seat`：座位号。
- `playerType`：玩家类型，真人或机器人。
- `ready`：是否准备。
- `onlineStatus`：在线状态。
- `joinedAt`：加入时间。
- `leftAt`：离开时间。

### 4.6 PlayerStat 玩家统计表

- [x] 已建表。
- [x] 已通过迁移 `20260907024052_add_remaining_database_tables` 创建。
- [x] 已实现对局结束后增量更新统计。
- [x] 已实现个人战绩接口：`GET /users/:userId/stats`。
- [x] 已实现排行榜接口：`GET /records/player-stats`。

建议字段：

- `id`：统计标识。
- `userId`：用户标识。
- `totalGames`：总局数。
- `winGames`：第一名次数。
- `averageRank`：平均名次。
- `lastGameAt`：最近对局时间。
- `updatedAt`：更新时间。

## 5. 数据存放策略

### 5.1 运行中对局状态

- [x] 短期继续使用内存仓库保存完整 `GameState`。
- [x] 中期使用 `GameSnapshot` 保存状态快照，支持内存缺失时按需恢复。
- [ ] 联机阶段可接入 Redis 保存运行中高频状态，PostgreSQL 作为长期记录和恢复兜底。

原则：

- 不把每张牌拆成关系表，避免初期表结构过度复杂。
- 完整牌面状态优先以 JSON 快照保存。
- 所有状态变更必须由服务端串行校验后写入新版本。

### 5.2 业务持久化数据

- [x] 用户基础资料存 `User`。
- [x] 用户个人配置存 `UserSetting`。
- [x] 对局主记录存 `Game`。
- [x] 对局玩家关系存 `GamePlayer`。
- [x] 对局结果存 `GameResult`。
- [x] 房间信息存 `Room`、`RoomPlayer`。
- [x] 玩家长期统计存 `PlayerStat`。

### 5.3 动作日志与回放数据

- [x] 初期存 PostgreSQL 的 `GameAction`。
- [x] 每次玩家动作、机器人动作和系统动作都写入动作日志。
- [x] 动作失败也写入失败日志，保留错误码和中文错误说明。
- [ ] 后续如果日志量变大，再考虑独立日志系统或分析数据库。

## 6. 数据库功能规划

### 6.1 已完成功能

- [x] Prisma Client 单例。
- [x] 数据库健康检查。
- [x] 未配置数据库时的空仓库兜底。
- [x] 创建对局时写入用户主记录。
- [x] 登录注册写入用户账号和会话。
- [x] 创建对局时写入对局主记录。
- [x] 创建对局时写入对局玩家关系。
- [x] 创建对局时使用事务写入用户、对局、玩家关系、初始快照和开局日志。
- [x] 用户配置读取和局部更新。
- [x] 最近对局主记录查询。
- [x] 最近对局支持按用户标识筛选。
- [x] Prisma Studio 本地查看数据。

### 6.2 待开发功能

- [x] 对局结束结果入库。
- [x] 对局动作日志入库。
- [x] 对局快照入库。
- [x] 内存缺失时按需恢复未结束对局。
- [x] 房间和房间成员入库。
- [x] 用户账号会话最小闭环。
- [ ] 接口权限校验中间件。
- [x] 玩家战绩统计。
- [ ] 数据清理、备份和迁移上线流程。

## 7. 阶段实施顺序

### 7.1 阶段 1：数据库基础接入

- [x] 安装 `prisma`、`@prisma/client`、`@prisma/adapter-pg`、`pg`。
- [x] 新增 `schema.prisma`。
- [x] 新增 `prisma.config.ts`。
- [x] 新增 `.env.example`。
- [x] 新增 Prisma Client 单例。
- [x] 新增数据库健康检查。
- [x] 新增 Prisma generate、migrate、studio 脚本。

### 7.2 阶段 2：低频核心业务表落库

- [x] 创建 `User` 表。
- [x] 创建 `Game` 表。
- [x] 创建 `UserSetting` 表。
- [x] 创建 `GamePlayer` 表。
- [x] 创建对局时写入用户、对局、对局玩家关系。
- [x] 创建对局初始落库使用事务，保证主记录、初始快照和开局日志一致。
- [x] 用户配置刷新后不丢失。
- [x] 创建 `GameResult` 表并写入对局结束结果。

### 7.3 阶段 3：动作日志落库

- [x] 创建 `GameAction` 表。
- [x] 玩家提交动作时写入日志。
- [x] 机器人单步推进时写入日志。
- [x] 系统事件通过事件日志兜底写入。
- [x] 动作失败时写入失败日志。
- [x] 增加按对局查询动作日志接口。

### 7.4 阶段 4：对局快照与恢复

- [x] 创建 `GameSnapshot` 表。
- [x] 成功动作后保存最新快照。
- [x] `Game.stateVersion` 与快照版本保持一致。
- [x] 查询或提交动作时如果内存不存在，尝试从数据库快照恢复。
- [x] 已补充服务层测试，覆盖查询视角、玩家动作和机器人动作的按需恢复链路。
- [ ] 服务启动时主动预加载未结束对局快照到内存仓库。

### 7.5 阶段 5：房间数据落库

- [x] 创建 `Room` 表。
- [x] 创建 `RoomPlayer` 表。
- [x] 实现房间创建、加入、离开、准备、关闭的数据写入。
- [x] 将 `Game.roomId` 与房间建立可选关系。
- [x] 实现房主从房间开始对局的数据写入。

### 7.6 阶段 6：并发控制与动作幂等

- [x] 为动作请求增加 `clientActionId`。
- [x] 使用 `Game.stateVersion` 校验动作提交版本。
- [x] 同一对局动作提交串行化。
- [x] 重复动作请求返回已有结果，不重复执行规则。
- [x] 前端提交动作时自动携带客户端动作标识和当前视角版本。
- [x] 成功动作数据库写入使用事务，保证动作日志、快照和版本同步。

### 7.7 阶段 7：战绩统计和运营数据

- [x] 创建 `PlayerStat` 表。
- [x] 对局结束后更新玩家统计。
- [x] 增加个人战绩接口。
- [x] 增加排行榜接口。
- [ ] 增加最近对局分页接口。
- [ ] 区分测试对局和正式对局。

### 7.8 阶段 8：数据清理、备份和运维

- [ ] 增加过期房间清理策略。
- [ ] 增加未结束测试对局清理策略。
- [ ] 增加动作日志保留策略。
- [ ] 增加数据库备份方案。
- [ ] 增加 Prisma 迁移上线流程。
- [ ] 增加连接池配置、慢查询观察和索引优化。

## 8. 常用命令

```bash
pnpm run dev:server:db
pnpm run db:health
pnpm run db:studio
pnpm --filter @gonghua/server run db:generate
pnpm --filter @gonghua/server run db:migrate
pnpm --filter @gonghua/server exec prisma format --config prisma.config.ts
```

说明：

- `dev:server:db` 用于显式按数据库模式启动后端；后端会自动读取 `apps/server/.env` 中的数据库连接。
- `db:health` 用于命令行快速检查 PostgreSQL 是否可连接，不输出数据库账号密码。
- `db:studio` 用于固定在 `http://localhost:5555` 打开 Prisma Studio 查看数据。
- `db:generate` 用于生成 Prisma Client。
- `db:migrate` 用于生成并应用迁移。
- 涉及真实数据库连接时，仍必须通过环境变量或本地 `.env` 提供连接串，不要把密码写入代码或日志。

## 9. 开发要求

- 不要把真实数据库账号、密码、连接串提交到仓库。
- 不要在 `game-core` 中引入 Prisma、Redis、Fastify 或环境变量。
- 不要让前端直接连接 PostgreSQL。
- 新增表必须同步更新 `docs/数据库表字段说明.md`。
- 新增数据库阶段必须同步更新本文档的已完成标记。
- 新增字段前必须确认 DTO、Prisma schema、服务层和前端消费位置。
- 涉及 Prisma schema 或迁移时，至少执行 `prisma format`、`db:generate`、`typecheck`。
