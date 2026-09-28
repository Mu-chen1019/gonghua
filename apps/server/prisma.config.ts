/**
 * Prisma CLI 配置文件。
 *
 * Prisma 7 将数据库连接配置从 schema.prisma 移到这里。
 * db:generate、db:migrate 和 db:studio 都通过本文件读取 schema 路径与 DATABASE_URL。
 */
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

/** 本地后端环境变量文件路径，供 Prisma CLI 自动加载数据库连接。 */
const localEnvFilePath = fileURLToPath(new URL(".env", import.meta.url));

if (existsSync(localEnvFilePath)) {
    loadEnvFile(localEnvFilePath);
}

export default defineConfig({
    schema: "prisma/schema.prisma",
    datasource:
        process.env.DATABASE_URL === undefined
            ? undefined
            : {
                  url: env("DATABASE_URL"),
                  shadowDatabaseUrl:
                      process.env.SHADOW_DATABASE_URL === undefined
                          ? undefined
                          : env("SHADOW_DATABASE_URL"),
              },
});
