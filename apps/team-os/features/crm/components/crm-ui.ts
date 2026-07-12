import type {
  CustomerFollowUpType,
  CustomerIntent,
  CustomerLevel,
  CustomerRiskLevel,
  CustomerStage
} from "@/apps/team-os/features/crm/types";

export const CUSTOMER_STAGE_LABELS: Record<CustomerStage, string> = {
  LEAD: "潜在线索",
  CONTACTED: "已联系",
  INTERESTED: "有意向",
  NEGOTIATING: "洽谈中",
  CUSTOMER: "已成交",
  LOST: "已流失"
};

export const CUSTOMER_LEVEL_LABELS: Record<CustomerLevel, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高"
};

export const FOLLOW_UP_TYPE_LABELS: Record<CustomerFollowUpType, string> = {
  CHAT: "聊天",
  CALL: "电话",
  MEETING: "面谈",
  OTHER: "其他"
};

export const CUSTOMER_INTENT_LABELS: Record<CustomerIntent, string> = {
  HIGH_INTENT: "高意向客户",
  HESITANT: "犹豫客户",
  REGULAR: "普通客户",
  CHURN_RISK: "流失风险客户"
};

export const CUSTOMER_RISK_LABELS: Record<CustomerRiskLevel, string> = {
  LOW: "低风险",
  MEDIUM: "中风险",
  HIGH: "高风险"
};

export function formatCrmDate(value?: string) {
  if (!value) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function crmScopeQuery(
  companyId?: string | null,
  teamId?: string | null,
  filters: { stage?: CustomerStage; level?: CustomerLevel; tag?: string } = {}
) {
  const query = new URLSearchParams();
  if (companyId) query.set("companyId", companyId);
  if (teamId) query.set("teamId", teamId);
  if (filters.stage) query.set("stage", filters.stage);
  if (filters.level) query.set("level", filters.level);
  if (filters.tag) query.set("tag", filters.tag);
  return query.toString();
}
