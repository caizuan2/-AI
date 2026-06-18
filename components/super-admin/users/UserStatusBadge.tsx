import type { SuperAdminUserAccountStatus } from "@/types/super-admin-users";

export function UserStatusBadge({ status, label }: { status: SuperAdminUserAccountStatus; label: string }) {
  const className = status === "active"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-300 bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
