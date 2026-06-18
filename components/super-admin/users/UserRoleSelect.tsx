import type { SuperAdminAssignableRole, SuperAdminRolePolicy } from "@/types/super-admin-users";

type UserRoleSelectProps = {
  roles: SuperAdminRolePolicy[];
  value: SuperAdminAssignableRole;
  onChange: (role: SuperAdminAssignableRole) => void;
};

export function UserRoleSelect({ roles, value, onChange }: UserRoleSelectProps) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as SuperAdminAssignableRole)}
      className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
    >
      {roles.map((role) => (
        <option key={role.role} value={role.role}>
          {role.label} ({role.role})
        </option>
      ))}
    </select>
  );
}
