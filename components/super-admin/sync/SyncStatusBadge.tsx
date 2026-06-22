import type { SyncCellStatus, SyncHealth } from "@/types/super-admin-sync";

const cellMeta: Record<SyncCellStatus, { label: string; className: string }> = {
  synced: {
    label: "已同步",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700"
  },
  pending: {
    label: "待同步",
    className: "border-amber-200 bg-amber-50 text-amber-700"
  },
  error: {
    label: "异常",
    className: "border-rose-200 bg-rose-50 text-rose-700"
  },
  not_configured: {
    label: "未配置",
    className: "border-slate-200 bg-slate-50 text-slate-600"
  }
};

const healthMeta: Record<SyncHealth, { label: string; className: string }> = {
  healthy: {
    label: "健康",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700"
  },
  warning: {
    label: "警告",
    className: "border-amber-200 bg-amber-50 text-amber-700"
  },
  error: {
    label: "异常",
    className: "border-rose-200 bg-rose-50 text-rose-700"
  }
};

export function SyncStatusBadge({ status }: { status: SyncCellStatus }) {
  const meta = cellMeta[status];

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export function SyncHealthBadge({ health }: { health: SyncHealth }) {
  const meta = healthMeta[health];

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}
