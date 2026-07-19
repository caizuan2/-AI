import { Award, BookCheck, UsersRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrainingManagementData } from "@/apps/team-os/features/training/types";

export function TrainingProgressList({ progress }: { progress: TrainingManagementData["progress"] }) {
  if (progress.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">当前管理范围内暂无员工培训数据。</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {progress.map((item) => {
        const percent = item.assigned > 0 ? Math.min(100, Math.round(item.completed / item.assigned * 100)) : 0;
        return (
          <Card key={`${item.teamId}:${item.userId}`}>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="h-4 w-4 text-indigo-700" />{item.userName}</CardTitle><p className="text-xs text-slate-500">{item.teamName}</p></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-slate-50 p-3"><p className="flex items-center gap-2 text-xs text-slate-500"><BookCheck className="h-3.5 w-3.5" />完成进度</p><p className="mt-1 font-semibold">{item.completed}/{item.assigned}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="flex items-center gap-2 text-xs text-slate-500"><Award className="h-3.5 w-3.5" />平均评分</p><p className="mt-1 font-semibold">{item.completed > 0 ? `${item.averageScore} 分` : "—"}</p></div></div>
              <div><div className="mb-2 flex justify-between text-xs text-slate-500"><span>课程完成率</span><span>{percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><div className="h-full rounded-full bg-indigo-600" style={{ width: `${percent}%` }} /></div></div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
