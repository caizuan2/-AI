import type { SuperAdminDbRole } from "@/types/super-admin-users";

const roleClasses: Record<SuperAdminDbRole, string> = {
  user: "border-slate-200 bg-slate-50 text-slate-700",
  kb_admin: "border-sky-200 bg-sky-50 text-sky-700",
  ingest_admin: "border-sky-200 bg-sky-50 text-sky-700",
  enterprise_admin: "border-amber-200 bg-amber-50 text-amber-800",
  super_admin: "border-rose-200 bg-rose-50 text-rose-700"
};

export function UserRoleBadge({ role, label }: { role: SuperAdminDbRole; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${roleClasses[role]}`}>
      {label}
    </span>
  );
}
