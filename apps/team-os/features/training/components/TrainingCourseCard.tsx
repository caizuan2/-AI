import type { ReactNode } from "react";
import { BookOpenText, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CourseBadges } from "@/apps/team-os/features/training/components/TrainingBadges";
import type { TrainingCourseRecord } from "@/apps/team-os/features/training/types";

export function TrainingCourseCard({
  course,
  expanded,
  onToggle,
  actions,
  footer
}: {
  course: TrainingCourseRecord;
  expanded: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className={course.status === "DISABLED" ? "opacity-80" : undefined}>
      <CardHeader className="gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
            <BookOpenText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="break-words text-lg">{course.title}</CardTitle>
            <div className="mt-2"><CourseBadges category={course.category} level={course.level} status={course.status} /></div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">{course.description}</p>
        <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={expanded}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {expanded ? "收起课程内容" : "查看课程内容"}
        </Button>
        {expanded ? (
          <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700 whitespace-pre-wrap break-words">
            {course.content}
          </div>
        ) : null}
        {footer}
        {actions ? <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}
