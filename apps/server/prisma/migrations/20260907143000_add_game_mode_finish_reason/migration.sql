-- 给对局主表补充模式和结束原因，支持人机局退出/重开与正常结算分开记录。
ALTER TABLE "Game" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "Game" ADD COLUMN "finishReason" TEXT;
