import type {
  CrmContractStatus,
  CrmLeadSource,
  CrmLeadStatus,
  CrmOpportunityStage,
  CrmOpportunityStatus,
  CrmReceivableStatus
} from "@/apps/team-os/features/crm/sales/types";

export const CRM_LEAD_SOURCE_LABELS: Record<CrmLeadSource, string> = {
  MANUAL: "手工录入",
  IMPORT: "合规导入",
  WEBSITE: "官网",
  REFERRAL: "转介绍",
  AI_PROSPECTING: "AI 找客",
  PARTNER: "合作伙伴",
  CAMPAIGN: "市场活动",
  OTHER: "其他"
};

export const CRM_LEAD_STATUS_LABELS: Record<CrmLeadStatus, string> = {
  NEW: "新线索",
  UNASSIGNED: "待分配",
  ASSIGNED: "已分配",
  CONTACTED: "已联系",
  QUALIFIED: "有效线索",
  CONVERTED: "已转客户",
  DISQUALIFIED: "无效线索",
  RECYCLED: "已回公海"
};

export const CRM_OPPORTUNITY_STAGE_LABELS: Record<CrmOpportunityStage, string> = {
  DISCOVERY: "需求发现",
  QUALIFICATION: "资格确认",
  SOLUTION: "方案沟通",
  QUOTATION: "正式报价",
  NEGOTIATION: "商务谈判",
  CONTRACT: "合同确认",
  WON: "赢单",
  LOST: "输单"
};

export const CRM_OPPORTUNITY_STATUS_LABELS: Record<CrmOpportunityStatus, string> = {
  OPEN: "推进中",
  WON: "已赢单",
  LOST: "已输单",
  ON_HOLD: "暂缓"
};

export const CRM_CONTRACT_STATUS_LABELS: Record<CrmContractStatus, string> = {
  DRAFT: "草稿",
  APPROVING: "审批中",
  ACTIVE: "已生效",
  COMPLETED: "已完成",
  CANCELLED: "已取消"
};

export const CRM_RECEIVABLE_STATUS_LABELS: Record<CrmReceivableStatus, string> = {
  PENDING: "待回款",
  PARTIAL: "部分回款",
  PAID: "已回款",
  OVERDUE: "已逾期",
  CANCELLED: "已取消"
};

export function formatCrmMoney(value: string | number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return "¥0.00";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2
  }).format(number);
}

export function formatCrmSalesDate(value?: string) {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}
