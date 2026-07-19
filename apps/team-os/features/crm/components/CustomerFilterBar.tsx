import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CUSTOMER_LEVEL_LABELS, CUSTOMER_STAGE_LABELS } from "@/apps/team-os/features/crm/components/crm-ui";
import { CUSTOMER_LEVELS, CUSTOMER_STAGES, type CrmTeamOption, type CustomerLevel, type CustomerStage } from "@/apps/team-os/features/crm/types";

export function CustomerFilterBar({ search, teamId, stage, level, tag, teams, tags, disabled, onSearchChange, onTeamChange, onStageChange, onLevelChange, onTagChange, onClear }: {
  search: string;
  teamId?: string;
  stage?: CustomerStage;
  level?: CustomerLevel;
  tag?: string;
  teams: CrmTeamOption[];
  tags: string[];
  disabled: boolean;
  onSearchChange: (value: string) => void;
  onTeamChange: (value?: string) => void;
  onStageChange: (value?: CustomerStage) => void;
  onLevelChange: (value?: CustomerLevel) => void;
  onTagChange: (value?: string) => void;
  onClear: () => void;
}) {
  const hasFilters = Boolean(search || stage || level || tag);

  return (
    <Card>
      <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_repeat(4,minmax(130px,1fr))_auto]">
        <label className="relative min-w-0">
          <span className="sr-only">搜索客户</span>
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <Input value={search} onChange={(event) => onSearchChange(event.target.value)} disabled={disabled} maxLength={100} className="pl-9" placeholder="搜索姓名、手机号或微信号" />
        </label>
        <label className="min-w-0"><span className="sr-only">筛选团队</span><select value={teamId ?? ""} onChange={(event) => onTeamChange(event.target.value || undefined)} disabled={disabled} className="focus-ring h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm disabled:cursor-wait disabled:opacity-60">{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label className="min-w-0"><span className="sr-only">筛选客户阶段</span><select value={stage ?? ""} onChange={(event) => onStageChange(event.target.value ? event.target.value as CustomerStage : undefined)} disabled={disabled} className="focus-ring h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm disabled:cursor-wait disabled:opacity-60"><option value="">全部阶段</option>{CUSTOMER_STAGES.map((item) => <option key={item} value={item}>{CUSTOMER_STAGE_LABELS[item]}</option>)}</select></label>
        <label className="min-w-0"><span className="sr-only">筛选客户等级</span><select value={level ?? ""} onChange={(event) => onLevelChange(event.target.value ? event.target.value as CustomerLevel : undefined)} disabled={disabled} className="focus-ring h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm disabled:cursor-wait disabled:opacity-60"><option value="">全部等级</option>{CUSTOMER_LEVELS.map((item) => <option key={item} value={item}>{CUSTOMER_LEVEL_LABELS[item]}价值</option>)}</select></label>
        <label className="min-w-0"><span className="sr-only">筛选客户标签</span><select value={tag ?? ""} onChange={(event) => onTagChange(event.target.value || undefined)} disabled={disabled} className="focus-ring h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm disabled:cursor-wait disabled:opacity-60"><option value="">全部标签</option>{tag && !tags.includes(tag) ? <option value={tag}>{tag}</option> : null}{tags.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <Button variant="outline" onClick={onClear} disabled={disabled || !hasFilters}><X className="h-4 w-4" />清除</Button>
      </CardContent>
    </Card>
  );
}
