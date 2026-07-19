export function formatTenantDate(value: string | null | undefined) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function formatTenantCurrency(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "价格待配置";
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "价格待配置";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2
  }).format(amount);
}

export function formatTenantCount(value: number | string | null | undefined, unit = "") {
  if (value === null || value === undefined || value === "") return "暂无采集";
  const numeric = typeof value === "number" ? value : Number(value);
  const displayed = Number.isFinite(numeric)
    ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(numeric)
    : String(value);
  return unit ? `${displayed} ${unit}` : displayed;
}

export function tenantUsagePercent(
  value: number | string | null | undefined,
  limit: number | string | null | undefined
) {
  const current = typeof value === "number" ? value : Number(value);
  const maximum = typeof limit === "number" ? limit : Number(limit);
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) return null;
  return (current / maximum) * 100;
}

export function tenantStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ACTIVE: "正常",
    DISABLED: "已停用",
    EXPIRED: "已到期",
    CANCELLED: "已取消",
    UNPROVISIONED: "待初始化"
  };
  return labels[status] ?? status;
}

export function tenantFeatureLabel(featureKey: string) {
  const labels: Record<string, string> = {
    knowledge: "AI 知识库",
    tasks: "任务中心",
    ai_coach: "AI 教练",
    crm: "AI CRM",
    training: "培训中心",
    analytics: "数据中心",
    KNOWLEDGE_BASE: "AI 知识库",
    CRM: "AI CRM",
    AI_COACH: "AI 教练",
    TRAINING: "培训中心",
    ANALYTICS: "数据中心",
    TASKS: "任务中心",
    ORGANIZATION: "组织管理"
  };
  return labels[featureKey] ?? featureKey;
}
