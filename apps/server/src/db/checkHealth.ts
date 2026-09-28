/**
 * 数据库命令行健康检查入口。
 *
 * 本文件复用 `checkDatabaseHealth`，用于 `pnpm run db:health` 快速确认当前进程是否能连接 PostgreSQL。
 * 它只输出连接状态，不打印 DATABASE_URL、账号密码或其他凭证。
 */
import { checkDatabaseHealth } from "./health";

/** 当前数据库连接探测结果。 */
const result = await checkDatabaseHealth();

console.log(result.message);

if (!result.ok) {
    process.exitCode = 1;
}
