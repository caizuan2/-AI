import type { ReactNode } from "react";

type MetricTone = "green" | "yellow" | "red" | "gray" | "blue";

const toneClass: Record<MetricTone, string> = {
  green: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
  yellow: "border-amber-100 bg-amber-50/80 text-amber-700",
  red: "border-rose-100 bg-rose-50/80 text-rose-700",
  gray: "border-gray-100 bg-gray-50 text-gray-600",
  blue: "border-sky-100 bg-sky-50/80 text-sky-700"
};

export function formatKnowledgeOSPercent(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue)) {
    return "--";
  }

  return `${Math.round(Math.max(0, Math.min(1, numberValue)) * 100)}%`;
}

export function knowledgeOSReadinessTone(readiness?: string): MetricTone {
  if (readiness === "ready") return "green";
  if (readiness === "warning") return "yellow";
  if (readiness === "blocked") return "red";

  return "gray";
}

export function knowledgeOSRiskTone(risk?: string): MetricTone {
  if (risk === "low") return "green";
  if (risk === "medium") return "yellow";
  if (risk === "high" || risk === "critical") return "red";

  return "gray";
}

export function IngestKnowledgeOSStatusBadge({ label, tone = "gray" }: {
  label: string;
  tone?: MetricTone;
}) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass[tone]}`}>
      {label}
    </span>
  );
}

export function IngestKnowledgeOSMetricCard({
  title,
  value,
  description,
  tone = "blue",
  footer
}: {
  title: string;
  value: ReactNode;
  description?: string;
  tone?: MetricTone;
  footer?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#ececea] bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a9a94]">{title}</p>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-[#202020]">{value}</div>
        </div>
        <span className={`h-2.5 w-2.5 rounded-full ${toneClass[tone].split(" ")[1]}`} />
      </div>
      {description ? <p className="mt-3 text-sm leading-5 text-[#6f6f69]">{description}</p> : null}
      {footer ? <div className="mt-4">{footer}</div> : null}
    </section>
  );
}
