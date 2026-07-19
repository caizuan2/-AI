import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsDistributionItem } from "@/apps/team-os/features/analytics/types";
import { clampPercent, formatAnalyticsDate, formatAnalyticsNumber } from "@/apps/team-os/features/analytics/utils/analytics-format";

export interface AnalyticsTrendSeries {
  label: string;
  color: string;
  points: Array<{ date: string; value: number | null }>;
}

function splitTrendSegments(series: AnalyticsTrendSeries, upperBound: number) {
  const width = 640;
  const height = 220;
  const left = 42;
  const right = 18;
  const top = 18;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const denominator = Math.max(1, series.points.length - 1);
  const segments: string[][] = [];
  let current: string[] = [];

  series.points.forEach((point, index) => {
    if (point.value === null || !Number.isFinite(point.value)) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    const x = left + (index / denominator) * plotWidth;
    const y = top + (1 - Math.min(upperBound, Math.max(0, point.value)) / upperBound) * plotHeight;
    current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (current.length > 0) segments.push(current);
  return segments;
}

export function AnalyticsTrendChart({
  title,
  description,
  series,
  maxValue,
  emptyLabel = "当前区间暂无趋势数据"
}: {
  title: string;
  description: string;
  series: AnalyticsTrendSeries[];
  maxValue?: number;
  emptyLabel?: string;
}) {
  const values = series.flatMap((item) => item.points.map((point) => point.value)).filter((value): value is number => value !== null && Number.isFinite(value));
  const hasData = values.length > 0;
  const upperBound = Math.max(1, maxValue ?? Math.ceil(Math.max(1, ...values) * 1.1));
  const labels = series[0]?.points ?? [];
  const labelIndexes = Array.from(new Set([0, Math.floor((labels.length - 1) / 2), labels.length - 1])).filter((index) => index >= 0 && labels[index]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </CardHeader>
      <CardContent>
        {!hasData ? <p className="py-16 text-center text-sm text-slate-500">{emptyLabel}</p> : (
          <>
            <div className="w-full overflow-hidden">
              <svg viewBox="0 0 640 220" className="h-auto w-full min-w-0" role="img" aria-label={`${title}。${description}`}>
                {[0, 0.5, 1].map((ratio) => {
                  const y = 18 + ratio * 164;
                  return <line key={ratio} x1="42" x2="622" y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />;
                })}
                <text x="6" y="25" fill="#64748b" fontSize="11">{formatAnalyticsNumber(upperBound)}</text>
                <text x="25" y="186" fill="#64748b" fontSize="11">0</text>
                {series.map((item) => splitTrendSegments(item, upperBound).map((segment, index) => (
                  <polyline
                    key={`${item.label}-${index}`}
                    points={segment.join(" ")}
                    fill="none"
                    stroke={item.color}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )))}
                {series.flatMap((item) => item.points.length <= 31 ? item.points.map((point, index) => {
                  if (point.value === null || !Number.isFinite(point.value)) return null;
                  const x = 42 + (index / Math.max(1, item.points.length - 1)) * 580;
                  const y = 18 + (1 - Math.min(upperBound, Math.max(0, point.value)) / upperBound) * 164;
                  return <circle key={`${item.label}-${point.date}-${index}`} cx={x} cy={y} r="3" fill={item.color} />;
                }) : [])}
                {labelIndexes.map((index) => {
                  const x = 42 + (index / Math.max(1, labels.length - 1)) * 580;
                  return <text key={index} x={x} y="211" textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"} fill="#64748b" fontSize="11">{formatAnalyticsDate(labels[index].date)}</text>;
                })}
              </svg>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600" aria-label="图例">
              {series.map((item) => <span key={item.label} className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}
            </div>
            <div className="sr-only">
              <p>{title}数据明细</p>
              <ul>
                {series.flatMap((item) => item.points.filter((point) => point.value !== null).map((point, index) => (
                  <li key={`${item.label}-${point.date}-${index}-detail`}>{item.label}，{formatAnalyticsDate(point.date)}，{formatAnalyticsNumber(point.value)}</li>
                )))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyticsBarList({
  title,
  description,
  items,
  unit = "COUNT",
  maxValue,
  emptyLabel = "暂无分布数据"
}: {
  title: string;
  description: string;
  items: AnalyticsDistributionItem[];
  unit?: "COUNT" | "PERCENT" | "SCORE";
  maxValue?: number;
  emptyLabel?: string;
}) {
  const maximum = Math.max(1, maxValue ?? Math.max(0, ...items.map((item) => item.value)));
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">{emptyLabel}</p> : (
          <div className="space-y-4">
            {items.map((item) => {
              const percent = clampPercent((Math.max(0, item.value) / maximum) * 100);
              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate text-slate-700" title={item.label}>{item.label}</span><span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatAnalyticsNumber(item.value, unit)}</span></div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${item.label}：${formatAnalyticsNumber(item.value, unit)}`} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={item.value}>
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyticsFunnel({ items }: { items: AnalyticsDistributionItem[] }) {
  const maximum = Math.max(1, ...items.map((item) => item.value));
  return (
    <Card>
      <CardHeader><CardTitle>当前阶段漏斗</CardTitle><p className="mt-1 text-sm leading-6 text-slate-500">依据客户当前阶段累计推导，不代表真实的历史转化路径或转化速度。</p></CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">暂无漏斗数据</p> : (
          <ol className="space-y-3">
            {items.map((item, index) => {
              const width = Math.max(12, (Math.max(0, item.value) / maximum) * 100);
              return (
                <li key={`${item.label}-${index}`} className="text-center">
                  <div className={`mx-auto rounded-lg px-3 py-2 text-sm font-semibold shadow-sm ${item.value > 0 ? "bg-gradient-to-r from-indigo-600 to-violet-500 text-white" : "border border-slate-200 bg-slate-50 text-slate-600"}`} style={{ width: `${width}%` }} aria-label={`${item.label}：${item.value} 位客户`}>
                    <span className="block truncate">{item.label}</span>
                    <span className={`text-xs font-medium ${item.value > 0 ? "text-indigo-100" : "text-slate-500"}`}>{item.value} 位</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
