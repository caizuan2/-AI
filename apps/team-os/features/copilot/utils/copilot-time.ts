const CHINA_OFFSET_MS = 8 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

export function chinaDayRange(now = new Date()) {
  const chinaNow = new Date(now.getTime() + CHINA_OFFSET_MS);
  const date = chinaNow.toISOString().slice(0, 10);
  const start = new Date(`${date}T00:00:00+08:00`);
  return {
    date,
    start,
    end: new Date(start.getTime() + DAY_MS)
  };
}

export function daysSince(value: Date | null | undefined, now = new Date()) {
  if (!value) return 999;
  return Math.max(0, Math.floor((now.getTime() - value.getTime()) / DAY_MS));
}

export function dueLabel(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待确认";
  if (date.getTime() < now.getTime()) return "已逾期";
  const days = Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
  return days <= 0 ? "今天截止" : `${days} 天后截止`;
}
