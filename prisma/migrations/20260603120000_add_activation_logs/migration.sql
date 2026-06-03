CREATE TABLE IF NOT EXISTS "activation_logs" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "message" TEXT NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "activation_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "activation_logs_codeHash_idx" ON "activation_logs"("codeHash");
CREATE INDEX IF NOT EXISTS "activation_logs_userId_idx" ON "activation_logs"("userId");
CREATE INDEX IF NOT EXISTS "activation_logs_success_idx" ON "activation_logs"("success");
CREATE INDEX IF NOT EXISTS "activation_logs_createdAt_idx" ON "activation_logs"("createdAt");
