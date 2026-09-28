# gonghua

TypeScript + React + Node 的攻花 H5 项目。

## 目录

- `apps/web`: H5 前端，只负责页面、交互和动画。
- `apps/server`: Node 后端，负责对局状态、动作校验和玩家视角过滤。
- `packages/contracts`: 前后端共享协议。
- `packages/game-core`: 游戏规则和状态机纯逻辑。

## 本地开发

```bash
pnpm install
pnpm dev:server
pnpm dev:web
```

知识总结独立维护在 `/Users/xyj/Desktop/gonghua-知识总结`。
