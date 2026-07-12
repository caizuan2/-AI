import type { CoachTeamOption } from "@/apps/team-os/features/ai-coach/types";

export function CoachTeamSelector({ teams, value, disabled = false, onChange }: { teams: CoachTeamOption[]; value: string | null; disabled?: boolean; onChange: (teamId: string) => void }) {
  if (teams.length <= 1) return null;

  return (
    <label className="flex min-w-0 flex-col gap-2 text-sm font-medium text-slate-600 sm:flex-row sm:items-center">
      当前团队
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="focus-ring h-10 min-w-0 w-full max-w-full rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink shadow-sm disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:max-w-96">
        {teams.map((team) => <option key={team.id} value={team.id}>{team.companyName ? `${team.companyName} · ` : ""}{team.name}</option>)}
      </select>
    </label>
  );
}
