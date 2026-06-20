import type { SuperAdminRolePolicy } from "@/types/super-admin-users";

const riskClasses = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-rose-200 bg-rose-50 text-rose-700"
};

export function RoleDescriptionCards({ roles }: { roles: SuperAdminRolePolicy[] }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {roles.map((role) => (
        <article key={role.role} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">{role.label}</h2>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${riskClasses[role.riskLevel]}`}>
              L{role.level}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">{role.description}</p>
          <p className="mt-4 text-xs font-medium text-slate-500">角色值</p>
          <p className="mt-1 font-mono text-xs text-slate-700">{role.role}</p>
        </article>
      ))}
    </section>
  );
}
