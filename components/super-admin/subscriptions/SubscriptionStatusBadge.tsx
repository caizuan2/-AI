import type { SubscriptionStatus } from "@/types/subscription";

const statusMeta: Record<SubscriptionStatus, { label: string; className: string }> = {
  active: {
    label: "active",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700"
  },
  expired: {
    label: "expired",
    className: "border-rose-200 bg-rose-50 text-rose-700"
  },
  trialing: {
    label: "trialing",
    className: "border-sky-200 bg-sky-50 text-sky-700"
  },
  disabled: {
    label: "disabled",
    className: "border-slate-200 bg-slate-100 text-slate-600"
  },
  pending: {
    label: "pending",
    className: "border-amber-200 bg-amber-50 text-amber-700"
  }
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const meta = statusMeta[status];

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}
