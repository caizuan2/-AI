-- CreateEnum
CREATE TYPE "CrmLeadSource" AS ENUM ('MANUAL', 'IMPORT', 'WEBSITE', 'REFERRAL', 'AI_PROSPECTING', 'PARTNER', 'CAMPAIGN', 'OTHER');

-- CreateEnum
CREATE TYPE "CrmLeadStatus" AS ENUM ('NEW', 'UNASSIGNED', 'ASSIGNED', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DISQUALIFIED', 'RECYCLED');

-- CreateEnum
CREATE TYPE "CrmContactRole" AS ENUM ('DECISION_MAKER', 'INFLUENCER', 'USER', 'FINANCE', 'TECHNICAL', 'PROCUREMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "CrmScoreSource" AS ENUM ('AI', 'MANUAL', 'RULE');

-- CreateEnum
CREATE TYPE "CrmOpportunityStage" AS ENUM ('DISCOVERY', 'QUALIFICATION', 'SOLUTION', 'QUOTATION', 'NEGOTIATION', 'CONTRACT', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CrmOpportunityStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "CrmContractStatus" AS ENUM ('DRAFT', 'APPROVING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmReceivableStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmVisitPlanStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'MISSED');

-- CreateEnum
CREATE TYPE "CrmConversationChannel" AS ENUM ('CRM_HISTORY', 'PHONE', 'WECHAT', 'WECHAT_WORK', 'MEETING', 'ONLINE_MEETING');

-- CreateEnum
CREATE TYPE "CrmConversationDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "CrmQualityInspectionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CrmDailyPlanStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmSalesTargetMetric" AS ENUM ('NEW_CUSTOMERS', 'VISITS', 'CALLS', 'OPPORTUNITY_AMOUNT', 'CONTRACT_AMOUNT', 'RECEIPT_AMOUNT', 'SALES_AMOUNT');

-- CreateEnum
CREATE TYPE "CrmSalesTargetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmIntegrationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "CrmAutomationTrigger" AS ENUM ('LEAD_CREATED', 'LEAD_IDLE', 'CUSTOMER_IDLE', 'STAGE_CHANGED', 'FOLLOW_UP_DUE', 'CONTRACT_DUE', 'RECEIVABLE_DUE', 'QUALITY_FAILED', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "CrmAutomationAction" AS ENUM ('ASSIGN_OWNER', 'RETURN_TO_POOL', 'CREATE_TASK', 'SEND_NOTIFICATION', 'UPDATE_STAGE', 'UPDATE_SCORE', 'START_WORKFLOW');

-- CreateEnum
CREATE TYPE "CrmAutomationRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CrmProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CrmOrderStatus" AS ENUM ('DRAFT', 'APPROVING', 'CONFIRMED', 'FULFILLING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmApprovalType" AS ENUM ('CUSTOMER', 'OPPORTUNITY', 'CONTRACT', 'ORDER', 'PAYMENT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CrmApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmApprovalStepStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');

-- CreateTable
CREATE TABLE "team_os_crm_leads" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "owner_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company_name" TEXT,
    "contact_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "wechat" TEXT,
    "industry" TEXT,
    "source" "CrmLeadSource" NOT NULL DEFAULT 'MANUAL',
    "source_detail" TEXT,
    "status" "CrmLeadStatus" NOT NULL DEFAULT 'NEW',
    "score" INTEGER NOT NULL DEFAULT 0,
    "score_reason" JSONB,
    "estimated_value" DECIMAL(18,2),
    "last_contact_at" TIMESTAMP(3),
    "next_follow_up_at" TIMESTAMP(3),
    "converted_customer_id" TEXT,
    "converted_at" TIMESTAMP(3),
    "lost_reason" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_crm_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_contacts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "owner_id" TEXT,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "department" TEXT,
    "role" "CrmContactRole" NOT NULL DEFAULT 'OTHER',
    "phone" TEXT,
    "email" TEXT,
    "wechat" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "influence_level" INTEGER NOT NULL DEFAULT 0,
    "birthday" DATE,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_crm_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_customer_stage_events" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "from_stage" "CustomerStage",
    "to_stage" "CustomerStage" NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_os_crm_customer_stage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_customer_scores" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "calculated_by_user_id" TEXT,
    "score" INTEGER NOT NULL,
    "level" "CustomerLevel" NOT NULL,
    "risk_level" "CustomerRiskLevel" NOT NULL,
    "source" "CrmScoreSource" NOT NULL,
    "dimensions" JSONB,
    "reason" TEXT NOT NULL DEFAULT '',
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_os_crm_customer_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_opportunities" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "primary_contact_id" TEXT,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" "CrmOpportunityStage" NOT NULL DEFAULT 'DISCOVERY',
    "status" "CrmOpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expected_close_date" DATE,
    "next_action" TEXT NOT NULL DEFAULT '',
    "competitors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decision_chain" JSONB,
    "loss_reason" TEXT,
    "won_at" TIMESTAMP(3),
    "lost_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_crm_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_opportunity_stage_events" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "opportunity_id" TEXT NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "from_stage" "CrmOpportunityStage",
    "to_stage" "CrmOpportunityStage" NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_os_crm_opportunity_stage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_contracts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "opportunity_id" TEXT,
    "owner_id" TEXT NOT NULL,
    "contract_no" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "CrmContractStatus" NOT NULL DEFAULT 'DRAFT',
    "signed_at" TIMESTAMP(3),
    "start_date" DATE,
    "end_date" DATE,
    "terms" JSONB,
    "file_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_crm_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_receivables" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "owner_id" TEXT,
    "installment_no" INTEGER NOT NULL DEFAULT 1,
    "amount" DECIMAL(18,2) NOT NULL,
    "received_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "due_date" DATE NOT NULL,
    "received_at" TIMESTAMP(3),
    "status" "CrmReceivableStatus" NOT NULL DEFAULT 'PENDING',
    "reminder_at" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_crm_receivables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_visit_plans" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "planned_start" TIMESTAMP(3) NOT NULL,
    "planned_end" TIMESTAMP(3),
    "actual_start" TIMESTAMP(3),
    "actual_end" TIMESTAMP(3),
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "status" "CrmVisitPlanStatus" NOT NULL DEFAULT 'PLANNED',
    "sign_in_at" TIMESTAMP(3),
    "sign_in_location" TEXT,
    "result" TEXT NOT NULL DEFAULT '',
    "next_action" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_crm_visit_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_conversations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "opportunity_id" TEXT,
    "user_id" TEXT NOT NULL,
    "integration_source_id" TEXT,
    "channel" "CrmConversationChannel" NOT NULL,
    "direction" "CrmConversationDirection" NOT NULL DEFAULT 'OUTBOUND',
    "external_id" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "transcript" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "media_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "consent_recorded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_crm_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_quality_inspections" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "conversation_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "inspected_by_id" TEXT,
    "status" "CrmQualityInspectionStatus" NOT NULL DEFAULT 'PENDING',
    "score" INTEGER NOT NULL DEFAULT 0,
    "valid_call" BOOLEAN,
    "matched_rules" JSONB,
    "needs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "objections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price_requests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sensitive_words" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "issues" JSONB,
    "unresolved_questions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_crm_quality_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_daily_plans" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "user_id" TEXT NOT NULL,
    "plan_date" DATE NOT NULL,
    "status" "CrmDailyPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "goals" JSONB,
    "key_customer_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "action_items" JSONB,
    "completed_summary" TEXT NOT NULL DEFAULT '',
    "ai_summary" TEXT NOT NULL DEFAULT '',
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_crm_daily_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_sales_targets" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "user_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "metric" "CrmSalesTargetMetric" NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "target_value" DECIMAL(18,2) NOT NULL,
    "achieved_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "CrmSalesTargetStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_crm_sales_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_integration_sources" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "channel" "CrmConversationChannel" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CrmIntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "external_tenant_id" TEXT,
    "config" JSONB,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_crm_integration_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_automation_rules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "trigger" "CrmAutomationTrigger" NOT NULL,
    "conditions" JSONB NOT NULL,
    "action" "CrmAutomationAction" NOT NULL,
    "action_config" JSONB NOT NULL,
    "status" "CrmAutomationRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_crm_automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_products" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT '件',
    "list_price" DECIMAL(18,2) NOT NULL,
    "cost_price" DECIMAL(18,2),
    "status" "CrmProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT NOT NULL DEFAULT '',
    "spec" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_crm_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_orders" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "opportunity_id" TEXT,
    "contract_id" TEXT,
    "owner_id" TEXT NOT NULL,
    "order_no" TEXT NOT NULL,
    "status" "CrmOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ordered_at" TIMESTAMP(3),
    "delivery_at" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_crm_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_order_items" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_os_crm_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_approvals" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "team_id" TEXT,
    "requester_id" TEXT NOT NULL,
    "type" "CrmApprovalType" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "CrmApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "flow_snapshot" JSONB,
    "submitted_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_os_crm_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_os_crm_approval_steps" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "approval_id" TEXT NOT NULL,
    "approver_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "status" "CrmApprovalStepStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT NOT NULL DEFAULT '',
    "acted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_os_crm_approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_os_crm_leads_converted_customer_id_key" ON "team_os_crm_leads"("converted_customer_id");

-- CreateIndex
CREATE INDEX "crm_leads_company_status_created_idx" ON "team_os_crm_leads"("company_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "crm_leads_company_team_status_updated_idx" ON "team_os_crm_leads"("company_id", "team_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "crm_leads_company_owner_status_followup_idx" ON "team_os_crm_leads"("company_id", "owner_id", "status", "next_follow_up_at");

-- CreateIndex
CREATE INDEX "crm_leads_company_score_updated_idx" ON "team_os_crm_leads"("company_id", "score", "updated_at");

-- CreateIndex
CREATE INDEX "crm_leads_company_phone_idx" ON "team_os_crm_leads"("company_id", "phone");

-- CreateIndex
CREATE INDEX "crm_leads_company_email_idx" ON "team_os_crm_leads"("company_id", "email");

-- CreateIndex
CREATE INDEX "crm_leads_company_converted_customer_idx" ON "team_os_crm_leads"("company_id", "converted_customer_id");

-- CreateIndex
CREATE INDEX "crm_contacts_company_customer_primary_idx" ON "team_os_crm_contacts"("company_id", "customer_id", "is_primary");

-- CreateIndex
CREATE INDEX "crm_contacts_company_team_updated_idx" ON "team_os_crm_contacts"("company_id", "team_id", "updated_at");

-- CreateIndex
CREATE INDEX "crm_contacts_company_owner_updated_idx" ON "team_os_crm_contacts"("company_id", "owner_id", "updated_at");

-- CreateIndex
CREATE INDEX "crm_contacts_company_phone_idx" ON "team_os_crm_contacts"("company_id", "phone");

-- CreateIndex
CREATE INDEX "crm_contacts_company_email_idx" ON "team_os_crm_contacts"("company_id", "email");

-- CreateIndex
CREATE INDEX "crm_customer_stage_events_company_customer_created_idx" ON "team_os_crm_customer_stage_events"("company_id", "customer_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_customer_stage_events_company_team_created_idx" ON "team_os_crm_customer_stage_events"("company_id", "team_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_customer_stage_events_company_user_created_idx" ON "team_os_crm_customer_stage_events"("company_id", "changed_by_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_customer_stage_events_company_stage_created_idx" ON "team_os_crm_customer_stage_events"("company_id", "to_stage", "created_at");

-- CreateIndex
CREATE INDEX "crm_customer_scores_company_customer_created_idx" ON "team_os_crm_customer_scores"("company_id", "customer_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_customer_scores_company_team_created_idx" ON "team_os_crm_customer_scores"("company_id", "team_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_customer_scores_company_risk_score_created_idx" ON "team_os_crm_customer_scores"("company_id", "risk_level", "score", "created_at");

-- CreateIndex
CREATE INDEX "crm_customer_scores_company_user_created_idx" ON "team_os_crm_customer_scores"("company_id", "calculated_by_user_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_opportunities_company_customer_updated_idx" ON "team_os_crm_opportunities"("company_id", "customer_id", "updated_at");

-- CreateIndex
CREATE INDEX "crm_opportunities_company_team_stage_updated_idx" ON "team_os_crm_opportunities"("company_id", "team_id", "stage", "updated_at");

-- CreateIndex
CREATE INDEX "crm_opportunities_company_owner_status_close_idx" ON "team_os_crm_opportunities"("company_id", "owner_id", "status", "expected_close_date");

-- CreateIndex
CREATE INDEX "crm_opportunities_company_stage_status_updated_idx" ON "team_os_crm_opportunities"("company_id", "stage", "status", "updated_at");

-- CreateIndex
CREATE INDEX "crm_opportunities_company_primary_contact_idx" ON "team_os_crm_opportunities"("company_id", "primary_contact_id");

-- CreateIndex
CREATE INDEX "crm_opportunity_stage_events_company_opportunity_created_idx" ON "team_os_crm_opportunity_stage_events"("company_id", "opportunity_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_opportunity_stage_events_company_team_created_idx" ON "team_os_crm_opportunity_stage_events"("company_id", "team_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_opportunity_stage_events_company_user_created_idx" ON "team_os_crm_opportunity_stage_events"("company_id", "changed_by_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_opportunity_stage_events_company_stage_created_idx" ON "team_os_crm_opportunity_stage_events"("company_id", "to_stage", "created_at");

-- CreateIndex
CREATE INDEX "crm_contracts_company_customer_updated_idx" ON "team_os_crm_contracts"("company_id", "customer_id", "updated_at");

-- CreateIndex
CREATE INDEX "crm_contracts_company_team_status_updated_idx" ON "team_os_crm_contracts"("company_id", "team_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "crm_contracts_company_owner_status_end_idx" ON "team_os_crm_contracts"("company_id", "owner_id", "status", "end_date");

-- CreateIndex
CREATE INDEX "crm_contracts_company_opportunity_idx" ON "team_os_crm_contracts"("company_id", "opportunity_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_contracts_company_contract_no_key" ON "team_os_crm_contracts"("company_id", "contract_no");

-- CreateIndex
CREATE INDEX "crm_receivables_company_customer_due_idx" ON "team_os_crm_receivables"("company_id", "customer_id", "due_date");

-- CreateIndex
CREATE INDEX "crm_receivables_company_team_status_due_idx" ON "team_os_crm_receivables"("company_id", "team_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "crm_receivables_company_owner_status_due_idx" ON "team_os_crm_receivables"("company_id", "owner_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "crm_receivables_company_contract_status_idx" ON "team_os_crm_receivables"("company_id", "contract_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "crm_receivables_company_contract_installment_key" ON "team_os_crm_receivables"("company_id", "contract_id", "installment_no");

-- CreateIndex
CREATE INDEX "crm_visit_plans_company_customer_start_idx" ON "team_os_crm_visit_plans"("company_id", "customer_id", "planned_start");

-- CreateIndex
CREATE INDEX "crm_visit_plans_company_team_status_start_idx" ON "team_os_crm_visit_plans"("company_id", "team_id", "status", "planned_start");

-- CreateIndex
CREATE INDEX "crm_visit_plans_company_owner_status_start_idx" ON "team_os_crm_visit_plans"("company_id", "owner_id", "status", "planned_start");

-- CreateIndex
CREATE INDEX "crm_visit_plans_company_contact_start_idx" ON "team_os_crm_visit_plans"("company_id", "contact_id", "planned_start");

-- CreateIndex
CREATE INDEX "crm_conversations_company_customer_started_idx" ON "team_os_crm_conversations"("company_id", "customer_id", "started_at");

-- CreateIndex
CREATE INDEX "crm_conversations_company_team_channel_started_idx" ON "team_os_crm_conversations"("company_id", "team_id", "channel", "started_at");

-- CreateIndex
CREATE INDEX "crm_conversations_company_user_started_idx" ON "team_os_crm_conversations"("company_id", "user_id", "started_at");

-- CreateIndex
CREATE INDEX "crm_conversations_company_opportunity_started_idx" ON "team_os_crm_conversations"("company_id", "opportunity_id", "started_at");

-- CreateIndex
CREATE INDEX "crm_conversations_company_integration_started_idx" ON "team_os_crm_conversations"("company_id", "integration_source_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "crm_conversations_company_channel_external_key" ON "team_os_crm_conversations"("company_id", "channel", "external_id");

-- CreateIndex
CREATE INDEX "crm_quality_inspections_company_conversation_created_idx" ON "team_os_crm_quality_inspections"("company_id", "conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_quality_inspections_company_customer_created_idx" ON "team_os_crm_quality_inspections"("company_id", "customer_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_quality_inspections_company_team_status_created_idx" ON "team_os_crm_quality_inspections"("company_id", "team_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "crm_quality_inspections_company_user_score_created_idx" ON "team_os_crm_quality_inspections"("company_id", "user_id", "score", "created_at");

-- CreateIndex
CREATE INDEX "crm_quality_inspections_company_inspector_created_idx" ON "team_os_crm_quality_inspections"("company_id", "inspected_by_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_daily_plans_company_team_date_status_idx" ON "team_os_crm_daily_plans"("company_id", "team_id", "plan_date", "status");

-- CreateIndex
CREATE INDEX "crm_daily_plans_company_user_status_date_idx" ON "team_os_crm_daily_plans"("company_id", "user_id", "status", "plan_date");

-- CreateIndex
CREATE UNIQUE INDEX "crm_daily_plans_company_user_date_key" ON "team_os_crm_daily_plans"("company_id", "user_id", "plan_date");

-- CreateIndex
CREATE INDEX "crm_sales_targets_company_team_metric_period_idx" ON "team_os_crm_sales_targets"("company_id", "team_id", "metric", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "crm_sales_targets_company_user_metric_period_idx" ON "team_os_crm_sales_targets"("company_id", "user_id", "metric", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "crm_sales_targets_company_status_end_idx" ON "team_os_crm_sales_targets"("company_id", "status", "period_end");

-- CreateIndex
CREATE INDEX "crm_sales_targets_company_creator_created_idx" ON "team_os_crm_sales_targets"("company_id", "created_by_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_integration_sources_company_team_status_updated_idx" ON "team_os_crm_integration_sources"("company_id", "team_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "crm_integration_sources_company_channel_status_idx" ON "team_os_crm_integration_sources"("company_id", "channel", "status");

-- CreateIndex
CREATE INDEX "crm_integration_sources_company_creator_created_idx" ON "team_os_crm_integration_sources"("company_id", "created_by_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "crm_integration_sources_company_channel_name_key" ON "team_os_crm_integration_sources"("company_id", "channel", "name");

-- CreateIndex
CREATE INDEX "crm_automation_rules_company_team_status_priority_idx" ON "team_os_crm_automation_rules"("company_id", "team_id", "status", "priority");

-- CreateIndex
CREATE INDEX "crm_automation_rules_company_trigger_status_idx" ON "team_os_crm_automation_rules"("company_id", "trigger", "status");

-- CreateIndex
CREATE INDEX "crm_automation_rules_company_creator_created_idx" ON "team_os_crm_automation_rules"("company_id", "created_by_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "crm_automation_rules_company_name_key" ON "team_os_crm_automation_rules"("company_id", "name");

-- CreateIndex
CREATE INDEX "crm_products_company_status_updated_idx" ON "team_os_crm_products"("company_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "crm_products_company_category_status_idx" ON "team_os_crm_products"("company_id", "category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "crm_products_company_sku_key" ON "team_os_crm_products"("company_id", "sku");

-- CreateIndex
CREATE INDEX "crm_orders_company_customer_updated_idx" ON "team_os_crm_orders"("company_id", "customer_id", "updated_at");

-- CreateIndex
CREATE INDEX "crm_orders_company_team_status_updated_idx" ON "team_os_crm_orders"("company_id", "team_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "crm_orders_company_owner_status_ordered_idx" ON "team_os_crm_orders"("company_id", "owner_id", "status", "ordered_at");

-- CreateIndex
CREATE INDEX "crm_orders_company_opportunity_idx" ON "team_os_crm_orders"("company_id", "opportunity_id");

-- CreateIndex
CREATE INDEX "crm_orders_company_contract_idx" ON "team_os_crm_orders"("company_id", "contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_orders_company_order_no_key" ON "team_os_crm_orders"("company_id", "order_no");

-- CreateIndex
CREATE INDEX "crm_order_items_company_order_idx" ON "team_os_crm_order_items"("company_id", "order_id");

-- CreateIndex
CREATE INDEX "crm_order_items_company_product_created_idx" ON "team_os_crm_order_items"("company_id", "product_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_approvals_company_team_status_created_idx" ON "team_os_crm_approvals"("company_id", "team_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "crm_approvals_company_requester_status_created_idx" ON "team_os_crm_approvals"("company_id", "requester_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "crm_approvals_company_entity_idx" ON "team_os_crm_approvals"("company_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "crm_approvals_company_type_status_created_idx" ON "team_os_crm_approvals"("company_id", "type", "status", "created_at");

-- CreateIndex
CREATE INDEX "crm_approval_steps_company_approver_status_created_idx" ON "team_os_crm_approval_steps"("company_id", "approver_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "crm_approval_steps_company_approval_status_idx" ON "team_os_crm_approval_steps"("company_id", "approval_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "crm_approval_steps_company_approval_order_key" ON "team_os_crm_approval_steps"("company_id", "approval_id", "step_order");

-- AddForeignKey
ALTER TABLE "team_os_crm_leads" ADD CONSTRAINT "team_os_crm_leads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_leads" ADD CONSTRAINT "team_os_crm_leads_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_leads" ADD CONSTRAINT "team_os_crm_leads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_leads" ADD CONSTRAINT "team_os_crm_leads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_leads" ADD CONSTRAINT "team_os_crm_leads_converted_customer_id_fkey" FOREIGN KEY ("converted_customer_id") REFERENCES "crm_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_contacts" ADD CONSTRAINT "team_os_crm_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_contacts" ADD CONSTRAINT "team_os_crm_contacts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_contacts" ADD CONSTRAINT "team_os_crm_contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_contacts" ADD CONSTRAINT "team_os_crm_contacts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_customer_stage_events" ADD CONSTRAINT "team_os_crm_customer_stage_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_customer_stage_events" ADD CONSTRAINT "team_os_crm_customer_stage_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_customer_stage_events" ADD CONSTRAINT "team_os_crm_customer_stage_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_customer_stage_events" ADD CONSTRAINT "team_os_crm_customer_stage_events_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_customer_scores" ADD CONSTRAINT "team_os_crm_customer_scores_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_customer_scores" ADD CONSTRAINT "team_os_crm_customer_scores_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_customer_scores" ADD CONSTRAINT "team_os_crm_customer_scores_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_customer_scores" ADD CONSTRAINT "team_os_crm_customer_scores_calculated_by_user_id_fkey" FOREIGN KEY ("calculated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_opportunities" ADD CONSTRAINT "team_os_crm_opportunities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_opportunities" ADD CONSTRAINT "team_os_crm_opportunities_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_opportunities" ADD CONSTRAINT "team_os_crm_opportunities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_opportunities" ADD CONSTRAINT "team_os_crm_opportunities_primary_contact_id_fkey" FOREIGN KEY ("primary_contact_id") REFERENCES "team_os_crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_opportunities" ADD CONSTRAINT "team_os_crm_opportunities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_opportunity_stage_events" ADD CONSTRAINT "team_os_crm_opportunity_stage_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_opportunity_stage_events" ADD CONSTRAINT "team_os_crm_opportunity_stage_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_opportunity_stage_events" ADD CONSTRAINT "team_os_crm_opportunity_stage_events_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "team_os_crm_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_opportunity_stage_events" ADD CONSTRAINT "team_os_crm_opportunity_stage_events_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_contracts" ADD CONSTRAINT "team_os_crm_contracts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_contracts" ADD CONSTRAINT "team_os_crm_contracts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_contracts" ADD CONSTRAINT "team_os_crm_contracts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_contracts" ADD CONSTRAINT "team_os_crm_contracts_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "team_os_crm_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_contracts" ADD CONSTRAINT "team_os_crm_contracts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_receivables" ADD CONSTRAINT "team_os_crm_receivables_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_receivables" ADD CONSTRAINT "team_os_crm_receivables_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_receivables" ADD CONSTRAINT "team_os_crm_receivables_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_receivables" ADD CONSTRAINT "team_os_crm_receivables_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "team_os_crm_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_receivables" ADD CONSTRAINT "team_os_crm_receivables_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_visit_plans" ADD CONSTRAINT "team_os_crm_visit_plans_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_visit_plans" ADD CONSTRAINT "team_os_crm_visit_plans_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_visit_plans" ADD CONSTRAINT "team_os_crm_visit_plans_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_visit_plans" ADD CONSTRAINT "team_os_crm_visit_plans_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "team_os_crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_visit_plans" ADD CONSTRAINT "team_os_crm_visit_plans_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_conversations" ADD CONSTRAINT "team_os_crm_conversations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_conversations" ADD CONSTRAINT "team_os_crm_conversations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_conversations" ADD CONSTRAINT "team_os_crm_conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_conversations" ADD CONSTRAINT "team_os_crm_conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "team_os_crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_conversations" ADD CONSTRAINT "team_os_crm_conversations_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "team_os_crm_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_conversations" ADD CONSTRAINT "team_os_crm_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_conversations" ADD CONSTRAINT "team_os_crm_conversations_integration_source_id_fkey" FOREIGN KEY ("integration_source_id") REFERENCES "team_os_crm_integration_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_quality_inspections" ADD CONSTRAINT "team_os_crm_quality_inspections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_quality_inspections" ADD CONSTRAINT "team_os_crm_quality_inspections_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_quality_inspections" ADD CONSTRAINT "team_os_crm_quality_inspections_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "team_os_crm_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_quality_inspections" ADD CONSTRAINT "team_os_crm_quality_inspections_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_quality_inspections" ADD CONSTRAINT "team_os_crm_quality_inspections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_quality_inspections" ADD CONSTRAINT "team_os_crm_quality_inspections_inspected_by_id_fkey" FOREIGN KEY ("inspected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_daily_plans" ADD CONSTRAINT "team_os_crm_daily_plans_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_daily_plans" ADD CONSTRAINT "team_os_crm_daily_plans_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_daily_plans" ADD CONSTRAINT "team_os_crm_daily_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_sales_targets" ADD CONSTRAINT "team_os_crm_sales_targets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_sales_targets" ADD CONSTRAINT "team_os_crm_sales_targets_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_sales_targets" ADD CONSTRAINT "team_os_crm_sales_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_sales_targets" ADD CONSTRAINT "team_os_crm_sales_targets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_integration_sources" ADD CONSTRAINT "team_os_crm_integration_sources_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_integration_sources" ADD CONSTRAINT "team_os_crm_integration_sources_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_integration_sources" ADD CONSTRAINT "team_os_crm_integration_sources_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_automation_rules" ADD CONSTRAINT "team_os_crm_automation_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_automation_rules" ADD CONSTRAINT "team_os_crm_automation_rules_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_automation_rules" ADD CONSTRAINT "team_os_crm_automation_rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_products" ADD CONSTRAINT "team_os_crm_products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_orders" ADD CONSTRAINT "team_os_crm_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_orders" ADD CONSTRAINT "team_os_crm_orders_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_orders" ADD CONSTRAINT "team_os_crm_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_orders" ADD CONSTRAINT "team_os_crm_orders_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "team_os_crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_orders" ADD CONSTRAINT "team_os_crm_orders_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "team_os_crm_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_orders" ADD CONSTRAINT "team_os_crm_orders_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "team_os_crm_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_orders" ADD CONSTRAINT "team_os_crm_orders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_order_items" ADD CONSTRAINT "team_os_crm_order_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_order_items" ADD CONSTRAINT "team_os_crm_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "team_os_crm_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_order_items" ADD CONSTRAINT "team_os_crm_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "team_os_crm_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_approvals" ADD CONSTRAINT "team_os_crm_approvals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_approvals" ADD CONSTRAINT "team_os_crm_approvals_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_approvals" ADD CONSTRAINT "team_os_crm_approvals_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_approval_steps" ADD CONSTRAINT "team_os_crm_approval_steps_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "team_os_tenant_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_approval_steps" ADD CONSTRAINT "team_os_crm_approval_steps_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "team_os_crm_approvals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_os_crm_approval_steps" ADD CONSTRAINT "team_os_crm_approval_steps_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
