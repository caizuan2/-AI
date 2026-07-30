-- CreateTable
CREATE TABLE "expert_catalog_zones" (
    "id" TEXT NOT NULL,
    "zone_key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expert_catalog_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expert_catalog_agents" (
    "id" TEXT NOT NULL,
    "agent_key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "protected_binding" BOOLEAN NOT NULL DEFAULT false,
    "zone_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avatar" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expert_catalog_agents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expert_catalog_zones_zone_key_key" ON "expert_catalog_zones"("zone_key");

-- CreateIndex
CREATE INDEX "expert_catalog_zones_status_sort_idx" ON "expert_catalog_zones"("status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "expert_catalog_agents_agent_key_key" ON "expert_catalog_agents"("agent_key");

-- CreateIndex
CREATE UNIQUE INDEX "expert_catalog_agents_knowledge_base_id_key" ON "expert_catalog_agents"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "expert_catalog_agents_zone_status_sort_idx" ON "expert_catalog_agents"("zone_id", "status", "sort_order");

-- CreateIndex
CREATE INDEX "expert_catalog_agents_protected_idx" ON "expert_catalog_agents"("protected_binding");

-- AddForeignKey
ALTER TABLE "expert_catalog_agents"
ADD CONSTRAINT "expert_catalog_agents_zone_id_fkey"
FOREIGN KEY ("zone_id") REFERENCES "expert_catalog_zones"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
