-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK', 'AI_COACH', 'CRM', 'TRAINING', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationReadStatus" AS ENUM ('UNREAD', 'READ');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WECHAT', 'DINGTALK', 'FEISHU');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('WECHAT_WORK', 'DINGTALK', 'FEISHU');

-- CreateTable
CREATE TABLE "team_os_notifications" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "read_status" "NotificationReadStatus" NOT NULL DEFAULT 'UNREAD',
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_os_notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "team_os_notifications_id_not_blank_check" CHECK (btrim("id") <> ''),
    CONSTRAINT "team_os_notifications_company_id_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "team_os_notifications_team_id_not_blank_check" CHECK ("team_id" IS NULL OR btrim("team_id") <> ''),
    CONSTRAINT "team_os_notifications_user_id_not_blank_check" CHECK (btrim("user_id") <> ''),
    CONSTRAINT "team_os_notifications_title_not_blank_check" CHECK (btrim("title") <> ''),
    CONSTRAINT "team_os_notifications_content_not_blank_check" CHECK (btrim("content") <> ''),
    CONSTRAINT "team_os_notifications_source_not_blank_check" CHECK (btrim("source") <> '')
);

-- CreateTable
CREATE TABLE "team_os_notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_os_notification_preferences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "team_os_notification_preferences_id_not_blank_check" CHECK (btrim("id") <> ''),
    CONSTRAINT "team_os_notification_preferences_user_id_not_blank_check" CHECK (btrim("user_id") <> '')
);

-- CreateTable
CREATE TABLE "team_os_integration_configs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_integration_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "team_os_integration_configs_id_not_blank_check" CHECK (btrim("id") <> ''),
    CONSTRAINT "team_os_integration_configs_company_id_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "team_os_integration_configs_config_object_check" CHECK (
      jsonb_typeof("config") = 'object'
      AND "config" <> '{}'::jsonb
    )
);

-- CreateIndex
CREATE INDEX "team_os_notifications_company_id_user_id_created_at_idx" ON "team_os_notifications"("company_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "team_os_notifications_company_id_team_id_created_at_idx" ON "team_os_notifications"("company_id", "team_id", "created_at");

-- CreateIndex
CREATE INDEX "team_os_notifications_user_id_read_status_created_at_idx" ON "team_os_notifications"("user_id", "read_status", "created_at");

-- CreateIndex
CREATE INDEX "team_os_notifications_company_id_type_created_at_idx" ON "team_os_notifications"("company_id", "type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "team_os_notification_preferences_user_id_channel_key" ON "team_os_notification_preferences"("user_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "team_os_integration_configs_company_id_provider_key" ON "team_os_integration_configs"("company_id", "provider");

-- CreateIndex
CREATE INDEX "team_os_integration_configs_provider_enabled_idx" ON "team_os_integration_configs"("provider", "enabled");
