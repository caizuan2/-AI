export function maskBusinessName(value: string) {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const first = Array.from(normalized)[0] ?? "客";
  return `${first}***`;
}

export function percentageValue(completed: number, total: number) {
  if (total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

export function metricText(value: number | null, suffix = "%") {
  return value === null ? "暂无数据" : `${Math.round(value)}${suffix}`;
}

export function safePersonName(value: string | null | undefined, userId: string) {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return normalized || `成员-${userId.slice(-4).padStart(4, "0")}`;
}
