ALTER TABLE "users"
ADD COLUMN "betaAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "betaRequestedAt" TIMESTAMP(3);

CREATE INDEX "users_betaAccess_idx" ON "users"("betaAccess");
CREATE INDEX "users_betaRequestedAt_idx" ON "users"("betaRequestedAt");
