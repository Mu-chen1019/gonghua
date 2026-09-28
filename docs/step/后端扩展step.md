# 攻花 H5 项目后端扩展阶段步骤

## 1. 文档目标

- 本文档描述后端服务从当前单机内存服务扩展到可联机、可恢复、可运营服务的步骤。
- 后端技术主线采用 `Fastify + TypeScript`，数据持久化细节统一维护在 `docs/step/数据库step.md`。
- 当前项目的权威对局状态仍由后端掌控，规则计算继续由 `packages/game-core` 负责。
- 后端扩展不改变 `game-core` 的纯规则职责，不让数据库、网络连接、账号体系进入核心规则包。
- 后续所有后端代码仍需要遵守根目录 `AGENTS.md`，新增接口、枚举、变量、常量、方法、函数和模块需要补充必要中文注释。

## 2. 当前后端状态

当前后端位于 `apps/server`，主要能力如下：

- [x] 使用 `Fastify` 提供 HTTP API。
- [x] 使用 `apps/server/src/game-store/` 中的内存仓库保存权威对局状态。
- [x] `apps/server/src/gameStore.ts` 保留旧路径兼容出口。
- [x] 创建对局、查询对局、提交玩家动作、推进机器人动作都读写内存状态。
- [x] 前端只接收 `createPlayerView` 生成的玩家视角，不直接持有完整权威状态。
- [x] 已具备数据库可选持久化能力；已建表和落库范围见 `docs/step/数据库step.md`。

当前主要问题：

- 服务重启、热更新或进程崩溃后，查询和提交动作可以按需从最新快照恢复，但还没有服务启动时主动预加载。
- 动作日志已落库，复杂问题可以结合前后端中文控制台日志和 `GameAction` 表排查。
- 当前已有房间基础接口和账号会话最小闭环，但还没有权限校验中间件和实时同步。
- 联机后会出现并发提交、重复提交、断线重连和状态同步问题，需要提前设计版本号和动作序号。

## 3. 后端目标架构

目标分层：

```text
apps/web
  |
  | HTTP / WebSocket
  v
apps/server
  |
  | routes
  v
application services
  |
  | 调用规则计算
  v
packages/game-core
  |
  | 返回新 GameState 和事件
  v
repositories
  |
  | Memory / Prisma / Redis
  v
PostgreSQL / Redis
```

职责边界：

- `routes`：只处理请求参数、响应包装和错误状态码。
- `services`：组织业务流程，例如创建房间、开始对局、提交动作、保存快照、广播事件。
- `repositories`：封装数据读写，业务层不直接依赖 Prisma 查询细节。
- `game-core`：只做规则判断和状态转换，不访问数据库、不发网络请求、不读取环境变量。
- `packages/contracts`：维护前后端共享 DTO、枚举、接口响应和事件结构。

## 4. 已完成后端能力

- [x] 对局路由：`POST /games`、`GET /games/:gameId`、`POST /games/:gameId/actions`、`POST /games/:gameId/bot-step`。
- [x] 健康检查路由：`GET /health`、`GET /health/db`。
- [x] 对局记录路由：`GET /records/games`。
- [x] 账号路由：`POST /auth/register`、`POST /auth/login`、`GET /auth/me`、`POST /auth/logout`。
- [x] 用户配置路由：`GET /users/:userId/settings`、`PUT /users/:userId/settings`。
- [x] 房间路由：`POST /rooms`、`GET /rooms/:roomId`、`POST /rooms/:roomId/join`、`POST /rooms/:roomId/leave`、`POST /rooms/:roomId/ready`、`POST /rooms/:roomId/start`、`POST /rooms/:roomId/close`。
- [x] 记录扩展路由：`GET /games/:gameId/actions`、`GET /games/:gameId/result`、`GET /users/:userId/stats`、`GET /records/player-stats`。
- [x] 对局仓库接口：`GameRepository`、`GameActionLogRepository`、`GameRecordRepository`。
- [x] 内存对局仓库：保存运行中完整 `GameState`。
- [x] 对局服务编排：创建对局、查询视角、提交玩家动作、推进机器人动作。
- [x] 可选数据库持久化：未配置数据库时使用空仓库，不阻塞正常游戏。
- [x] 创建对局初始落库事务：用户、对局主记录、玩家关系、初始快照和开局日志一致写入。
- [x] 对局快照按需恢复：内存状态缺失时可从最新快照恢复。
- [x] 账号会话最小闭环：注册、登录、查询当前用户和登出。
- [x] 最近对局支持按 `userId` 查询个人参与记录。
- [x] 中文日志输出：接口、仓库、页面和规则事件都保留中文排查信息。

## 5. 后端阶段顺序

### 5.1 阶段 1：路由和服务边界收口

状态：已完成。

任务：

- [x] 将 `gameStore.ts` 收口为兼容出口。
- [x] 新增 `apps/server/src/game-store/` 目录，集中放对局仓库接口、内存实现和服务编排。
- [x] 路由层只做参数校验、响应包装和日志输出。
- [x] 服务层统一调用 `game-core`，不在路由里写游戏规则。
- [x] 保持前端现有接口路径不变。

完成标准：

- 创建对局、查询对局、提交动作、机器人推进行为不变。
- 替换仓库实现不需要改路由层。
- `pnpm run typecheck`、`pnpm run lint`、`pnpm run test` 通过。

### 5.2 阶段 2：数据库可选持久化接入

状态：已完成基础能力，数据库细节已抽离。

任务：

- [x] 后端通过仓库接口接入数据库持久化。
- [x] 未配置数据库时使用空仓库，避免阻塞本地单机玩法。
- [x] 创建对局时可写入用户、对局和对局玩家关系。
- [x] 创建对局初始快照和开局日志与主记录使用同一事务写入。
- [x] 用户配置可以读取和保存。
- [x] 对局结束结果需要写入数据库。
- [x] 动作日志和快照需要写入数据库。

说明：

- 表结构、字段说明、迁移顺序和数据库功能统一维护在 `docs/step/数据库step.md`。
- 本阶段后端只关心仓库边界和调用时机，不在阶段文档里重复展开表字段。

完成标准：

- 数据库不可用时，不影响当前单机对局。
- 数据库可用时，低频业务记录能正常写入。
- 新增数据库能力必须同步更新数据库 step 和字段说明文档。

### 5.3 阶段 3：动作日志服务化

状态：已完成基础能力。

任务：

- [x] 保留现有控制台中文日志。
- [x] 将玩家动作、机器人动作、系统动作统一抽象为动作日志仓库边界。
- [x] 动作成功和失败都有结构化日志入口。
- [x] 日志仓库调用数据库写入动作记录。
- [x] 增加按对局查询动作日志接口。

完成标准：

- 任意一局对局都可以追踪完整动作链路。
- 动作日志包含动作来源、动作类型、执行结果、错误码和事件摘要。
- 动作失败不会吞掉错误原因。

### 5.4 阶段 4：对局快照与恢复服务

状态：已完成按需恢复基础能力。

任务：

- [x] 成功动作后触发快照保存。
- [ ] 服务启动时加载未结束对局快照到内存仓库。
- [x] 查询对局或提交动作时如果内存不存在，尝试从数据库快照恢复。
- [x] 快照恢复前执行最小结构校验。
- [x] 已补充恢复测试，覆盖玩家视角查询、玩家动作提交和机器人动作推进。
- [x] 恢复失败时返回明确错误，并输出中文日志。

完成标准：

- 服务重启后未结束对局可以继续操作。
- 快照版本不会倒退。
- 恢复异常可以通过日志定位。

### 5.5 阶段 5：并发控制与动作幂等

状态：已完成。

任务：

- [x] 为动作请求增加 `clientActionId`。
- [x] 为动作请求增加客户端视角 `stateVersion`。
- [x] 服务端校验版本，旧版本动作引导前端刷新。
- [x] 同一对局动作提交串行化处理。
- [x] 重复提交同一个 `clientActionId` 时返回已有结果，不重复执行规则。
- [x] 成功动作数据库写入使用事务，保证动作日志、快照和对局版本一致。

完成标准：

- [x] 快速重复点击不会导致重复出牌。
- [x] 两个玩家同时提交时不会覆盖彼此状态。
- [x] 动作日志、快照和版本号一一对应。

### 5.6 阶段 6：联机房间服务

状态：已完成基础能力，已接入基础登录态和资源权限校验。

任务：

- [x] 创建房间。
- [x] 加入房间。
- [x] 离开房间。
- [x] 准备或取消准备。
- [x] 房主开始对局。
- [x] 查询房间快照。
- [x] 房间软消失逻辑：已开始或已关闭房间不可再加入，未开始房间无人后自动关闭。
- [ ] 支持机器人自动补位。

完成标准：

- 多个玩家可以进入同一房间并看到一致的成员状态。
- 房主权限和座位关系明确。
- 房间开始对局后可以生成对应 `Game`。
- 房间不会物理删除，关闭时写入 `CLOSED` 和 `closedAt`，保留记录用于排查和后续统计。

### 5.7 阶段 7：实时同步

状态：已完成基础记录和统计接口。

任务：

- [ ] 接入 WebSocket。
- [ ] 建立房间频道和对局频道。
- [ ] 玩家动作成功后广播最新玩家视角或事件增量。
- [ ] 支持断线重连。
- [ ] 支持断线托管，超时后可让机器人接管该座位。
- [ ] WebSocket 不可用时保留 HTTP 查询作为降级方案。

完成标准：

- 多个浏览器窗口进入同一房间时状态一致。
- 玩家动作后其他玩家能实时看到变化。
- 断线重连后能恢复当前对局视角。

### 5.8 阶段 8：账号体系与权限

状态：未开始。

任务：

- [x] 支持账号注册和登录。
- [ ] 支持访客账号。
- [ ] 预留手机号、第三方登录或平台登录扩展点。
- [x] 增加 Bearer token 会话机制，服务端只保存 token 摘要。
- [ ] 后续生产环境评估安全 Cookie。
- [ ] 增加接口鉴权中间件。
- [ ] 用户只能修改自己的配置。
- [ ] 房主才能开始房间、踢人或调整房间配置。
- [x] 登录用户创建对局和房间时使用真实用户标识。
- [x] 对局结束后结果可通过 `GamePlayer.userId` 归属到真实用户。

完成标准：

- 用户刷新页面后能恢复身份。
- 用户配置和战绩与用户标识绑定。
- 越权访问会被拒绝并输出明确错误。

### 5.9 阶段 9：记录、战绩和运营接口

状态：未开始。

任务：

- [x] 增加对局结果查询接口。
- [x] 增加最近对局按用户筛选能力。
- [ ] 增加最近对局分页接口。
- [x] 增加个人战绩接口。
- [x] 预留排行榜接口。
- [ ] 增加按时间、玩家、房间查询对局记录能力。
- [ ] 区分测试对局和正式对局，避免测试数据污染统计。

完成标准：

- 个人页可以展示总局数、胜率、平均名次、最近对局。
- 对局记录页能展示对局摘要和最终排名。
- 测试对局可以被过滤。

### 5.10 阶段 10：运维能力

状态：未开始。

任务：

- [ ] 增加过期房间清理任务。
- [ ] 增加未结束测试对局清理任务。
- [ ] 增加请求日志中间件。
- [ ] 增加关键错误告警边界。
- [ ] 增加上线前健康检查脚本。

完成标准：

- 长期运行不会堆积大量无效房间和测试对局。
- 线上异常可以通过日志和数据定位。
- 发布前可以快速确认服务、数据库和缓存状态。

## 6. 推荐实施顺序

1. 阶段 1：路由和服务边界收口。
2. 阶段 2：数据库可选持久化接入。
3. 阶段 3：动作日志服务化。
4. 阶段 4：对局快照与恢复服务。
5. 阶段 5：并发控制与动作幂等。
6. 阶段 6：联机房间服务。
7. 阶段 7：实时同步。
8. 阶段 8：账号体系与权限。
9. 阶段 9：记录、战绩和运营接口。
10. 阶段 10：运维能力。

说明：

- 动作日志和快照应早于正式联机实现，因为它们能提升调试、恢复和一致性能力。
- 账号体系可以先用访客用户承接，后续再接正式登录。
- 联机开发前必须先完成状态版本号、动作幂等和权限边界。
- 数据库建表顺序以 `docs/step/数据库step.md` 为准。

## 7. 后端目录建议

推荐后续逐步调整为：

```text
apps/server/src/
├─ app.ts
├─ index.ts
├─ db/
│  ├─ health.ts
│  └─ prisma.ts
├─ routes/
│  ├─ games.ts
│  ├─ health.ts
│  ├─ records.ts
│  ├─ rooms.ts
│  └─ users.ts
├─ game-store/
│  ├─ index.ts
│  ├─ types.ts
│  ├─ gameService.ts
│  ├─ memoryGameRepository.ts
│  ├─ noopGameRecordRepository.ts
│  └─ prismaGameRecordRepository.ts
├─ user-store/
│  ├─ index.ts
│  ├─ types.ts
│  ├─ defaultUserSetting.ts
│  ├─ noopUserSettingRepository.ts
│  └─ prismaUserSettingRepository.ts
├─ services/
│  ├─ roomService.ts
│  ├─ actionLogService.ts
│  ├─ snapshotService.ts
│  └─ botStepService.ts
├─ repositories/
│  ├─ roomRepository.ts
│  ├─ actionLogRepository.ts
│  └─ snapshotRepository.ts
├─ middlewares/
│  ├─ authMiddleware.ts
│  └─ requestLogMiddleware.ts
├─ jobs/
│  ├─ cleanupExpiredRoomsJob.ts
│  └─ snapshotCompactionJob.ts
└─ logger.ts
```

拆分原则：

- 路由文件不直接写 Prisma。
- 服务文件不直接拼接 SQL。
- 仓库文件不写游戏规则。
- 机器人推进可以独立服务化，但最终动作仍走 `game-core` 校验。
- 新功能提前考虑模块边界，不把逻辑先堆进单个文件再回头拆分。

## 8. 接口规划

### 8.1 已有接口

- [x] `GET /health`：服务健康检查。
- [x] `GET /health/db`：数据库连接检查。
- [x] `POST /games`：创建对局。
- [x] `GET /games/:gameId`：获取当前玩家对局视角。
- [x] `POST /games/:gameId/actions`：提交玩家动作。
- [x] `POST /games/:gameId/bot-step`：推进机器人动作。
- [x] `GET /records/games`：查询最近对局主记录。
- [x] `POST /auth/register`：注册账号并创建会话。
- [x] `POST /auth/login`：登录账号并创建会话。
- [x] `GET /auth/me`：按 Bearer token 查询当前用户。
- [x] `POST /auth/logout`：登出当前会话。
- [x] `GET /users/:userId/settings`：查询用户配置。
- [x] `PUT /users/:userId/settings`：更新用户配置。
- [x] `POST /rooms`：创建房间。
- [x] `GET /rooms/:roomId`：获取房间快照。
- [x] `POST /rooms/:roomId/join`：加入房间。
- [x] `POST /rooms/:roomId/leave`：离开房间。
- [x] `POST /rooms/:roomId/ready`：准备或取消准备。
- [x] `POST /rooms/:roomId/close`：关闭房间。
- [x] `GET /games/:gameId/actions`：查询对局动作日志。
- [x] `GET /games/:gameId/result`：查询对局结果。
- [x] `GET /users/:userId/stats`：获取用户战绩。
- [x] `GET /records/player-stats`：查询玩家统计排行。

### 8.2 待规划用户接口

- [x] `GET /auth/me`：获取当前登录用户信息。
- [ ] `PATCH /users/me/settings`：按真实登录态更新当前用户配置。
- [x] `GET /users/:userId/stats`：获取指定用户战绩。
- [ ] `GET /users/me/stats`：按真实登录态获取当前用户战绩。
- [ ] `GET /users/me/games`：获取最近对局记录。

### 8.3 待规划房间接口

- [x] `POST /rooms`：创建房间。
- [x] `POST /rooms/:roomId/join`：加入房间。
- [x] `POST /rooms/:roomId/leave`：离开房间。
- [x] `POST /rooms/:roomId/ready`：准备或取消准备。
- [x] `POST /rooms/:roomId/start`：开始对局。
- [x] `GET /rooms/:roomId`：获取房间快照。

### 8.4 待规划对局记录接口

- [x] `GET /games/:gameId/actions`：查询对局动作日志。
- [x] `GET /games/:gameId/result`：查询对局结果。
- [ ] `GET /records/games/:gameId`：查询单局记录详情。

### 8.5 待规划运维接口

- [ ] `GET /health/cache`：缓存连接检查，接入 Redis 后启用。

## 9. 测试策略

后端扩展需要分层测试：

- Repository 测试：验证仓库读写、事务、唯一约束和查询结果。
- Service 测试：验证创建房间、开始对局、提交动作、保存日志、保存快照。
- Route 测试：验证请求参数、响应结构、错误码和权限。
- 恢复测试：验证服务重启后从快照恢复对局。
- 并发测试：验证重复提交、乱序提交和同时提交。

推荐命令：

```bash
pnpm --filter @gonghua/server run lint
pnpm --filter @gonghua/server run typecheck
pnpm --filter @gonghua/server run test
pnpm run test
```

## 10. 开发注意事项

- 不要把真实数据库账号、密码、连接串提交到仓库。
- 不要在 `game-core` 中引入 Prisma、Redis、Fastify 或环境变量。
- 不要让前端直接连接 PostgreSQL。
- 不要只保存最终结果，动作日志和快照都要保留。
- 不要把动作合法性判断放到数据库层，规则仍由 `game-core` 负责。
- 新增字段前必须先确认 DTO、Prisma schema、服务层和前端消费位置。
- 新增后端模块必须补充中文注释和必要文档。
- 影响接口行为时必须补充或更新测试。
- 涉及数据库表、字段、迁移和落库能力时，同步更新 `docs/step/数据库step.md`。

## 11. 阶段交付要求

每个后端扩展阶段交付时需要说明：

- 本阶段新增或修改的接口。
- 本阶段新增或修改的后端目录和模块。
- 是否影响现有前端调用。
- 是否影响现有 `game-core` 规则。
- 是否新增环境变量。
- 是否包含数据库迁移；如包含，必须同步说明对应数据库 step。
- 已执行的检查命令和结果。
- 未完成风险和下一阶段建议。
