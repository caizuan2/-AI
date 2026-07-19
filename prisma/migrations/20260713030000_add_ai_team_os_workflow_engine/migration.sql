-- CreateEnum
CREATE TYPE "WorkflowTriggerType" AS ENUM ('TASK', 'CRM', 'AI_COACH', 'TRAINING', 'ANALYTICS', 'SYSTEM');

-- CreateEnum
CREATE TYPE "WorkflowEventType" AS ENUM ('TASK_COMPLETED', 'TASK_OVERDUE', 'CRM_RISK_FOUND', 'EMPLOYEE_SCORE_LOW', 'TRAINING_FINISHED', 'BUSINESS_METRIC_ALERT', 'SYSTEM_TRIGGERED');

-- CreateEnum
CREATE TYPE "WorkflowDefinitionStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "WorkflowExecutionStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WorkflowExecutionMode" AS ENUM ('TEST', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "WorkflowActionType" AS ENUM ('CREATE_TASK', 'SEND_NOTIFICATION', 'ASSIGN_TRAINING', 'CREATE_FOLLOWUP', 'GENERATE_REPORT');

-- CreateTable
CREATE TABLE "workflow_definitions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "trigger_type" "WorkflowTriggerType" NOT NULL,
    "event_type" "WorkflowEventType" NOT NULL,
    "status" "WorkflowDefinitionStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_definitions_id_not_blank_check" CHECK (btrim("id") <> ''),
    CONSTRAINT "workflow_definitions_company_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "workflow_definitions_team_not_blank_check" CHECK ("team_id" IS NULL OR btrim("team_id") <> ''),
    CONSTRAINT "workflow_definitions_name_not_blank_check" CHECK (btrim("name") <> ''),
    CONSTRAINT "workflow_definitions_description_not_blank_check" CHECK (btrim("description") <> ''),
    CONSTRAINT "workflow_definitions_created_by_not_blank_check" CHECK (btrim("created_by") <> ''),
    CONSTRAINT "workflow_definitions_config_object_check" CHECK (jsonb_typeof("config") = 'object'),
    CONSTRAINT "workflow_definitions_trigger_event_check" CHECK (
      ("trigger_type" = 'TASK' AND "event_type" IN ('TASK_COMPLETED', 'TASK_OVERDUE')) OR
      ("trigger_type" = 'CRM' AND "event_type" = 'CRM_RISK_FOUND') OR
      ("trigger_type" = 'AI_COACH' AND "event_type" = 'EMPLOYEE_SCORE_LOW') OR
      ("trigger_type" = 'TRAINING' AND "event_type" = 'TRAINING_FINISHED') OR
      ("trigger_type" = 'ANALYTICS' AND "event_type" = 'BUSINESS_METRIC_ALERT') OR
      ("trigger_type" = 'SYSTEM' AND "event_type" = 'SYSTEM_TRIGGERED')
    )
);

-- CreateTable
CREATE TABLE "workflow_actions" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "action_type" "WorkflowActionType" NOT NULL,
    "config" JSONB NOT NULL,
    "action_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_actions_id_not_blank_check" CHECK (btrim("id") <> ''),
    CONSTRAINT "workflow_actions_workflow_not_blank_check" CHECK (btrim("workflow_id") <> ''),
    CONSTRAINT "workflow_actions_company_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "workflow_actions_config_object_check" CHECK (jsonb_typeof("config") = 'object'),
    CONSTRAINT "workflow_actions_order_positive_check" CHECK ("action_order" >= 1)
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "triggered_by" TEXT,
    "event_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "event_type" "WorkflowEventType" NOT NULL,
    "mode" "WorkflowExecutionMode" NOT NULL,
    "trigger_data" JSONB NOT NULL,
    "status" "WorkflowExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "decision" JSONB,
    "result" JSONB,
    "error" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_executions_id_not_blank_check" CHECK (btrim("id") <> ''),
    CONSTRAINT "workflow_executions_workflow_not_blank_check" CHECK (btrim("workflow_id") <> ''),
    CONSTRAINT "workflow_executions_company_not_blank_check" CHECK (btrim("company_id") <> ''),
    CONSTRAINT "workflow_executions_team_not_blank_check" CHECK ("team_id" IS NULL OR btrim("team_id") <> ''),
    CONSTRAINT "workflow_executions_actor_not_blank_check" CHECK ("triggered_by" IS NULL OR btrim("triggered_by") <> ''),
    CONSTRAINT "workflow_executions_event_not_blank_check" CHECK (btrim("event_id") <> ''),
    CONSTRAINT "workflow_executions_idempotency_not_blank_check" CHECK (btrim("idempotency_key") <> ''),
    CONSTRAINT "workflow_executions_trigger_data_object_check" CHECK (jsonb_typeof("trigger_data") = 'object'),
    CONSTRAINT "workflow_executions_decision_object_check" CHECK ("decision" IS NULL OR jsonb_typeof("decision") = 'object'),
    CONSTRAINT "workflow_executions_result_object_check" CHECK ("result" IS NULL OR jsonb_typeof("result") = 'object'),
    CONSTRAINT "workflow_executions_error_object_check" CHECK ("error" IS NULL OR jsonb_typeof("error") = 'object'),
    CONSTRAINT "workflow_executions_finished_state_check" CHECK (
      ("status" = 'RUNNING' AND "finished_at" IS NULL) OR
      ("status" <> 'RUNNING' AND "finished_at" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_definitions_id_company_id_key" ON "workflow_definitions"("id", "company_id");
CREATE INDEX "workflow_defs_company_status_event_updated_idx" ON "workflow_definitions"("company_id", "status", "event_type", "updated_at");
CREATE INDEX "workflow_defs_company_team_status_idx" ON "workflow_definitions"("company_id", "team_id", "status");
CREATE INDEX "workflow_defs_created_by_updated_at_idx" ON "workflow_definitions"("created_by", "updated_at");
CREATE UNIQUE INDEX "workflow_actions_company_workflow_order_key" ON "workflow_actions"("company_id", "workflow_id", "action_order");
CREATE INDEX "workflow_actions_company_action_type_idx" ON "workflow_actions"("company_id", "action_type");
CREATE UNIQUE INDEX "workflow_execs_company_workflow_idempotency_key" ON "workflow_executions"("company_id", "workflow_id", "idempotency_key");
CREATE INDEX "workflow_execs_company_status_created_idx" ON "workflow_executions"("company_id", "status", "created_at");
CREATE INDEX "workflow_execs_company_team_status_created_idx" ON "workflow_executions"("company_id", "team_id", "status", "created_at");
CREATE INDEX "workflow_execs_workflow_created_idx" ON "workflow_executions"("workflow_id", "created_at");

-- AddForeignKey
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_defs_team_company_fkey" FOREIGN KEY ("team_id", "company_id") REFERENCES "team_organizations"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_actions" ADD CONSTRAINT "workflow_actions_workflow_company_fkey" FOREIGN KEY ("workflow_id", "company_id") REFERENCES "workflow_definitions"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_execs_workflow_company_fkey" FOREIGN KEY ("workflow_id", "company_id") REFERENCES "workflow_definitions"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
