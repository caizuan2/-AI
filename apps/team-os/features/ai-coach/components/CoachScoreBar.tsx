export function CoachScoreBar({
  label,
  score,
  maxScore = 20,
  level
}: {
  label: string;
  score: number;
  maxScore?: number;
  level?: string;
}) {
  const safeMax = Math.max(1, maxScore);
  const percentage = Math.max(0, Math.min(100, (score / safeMax) * 100));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="whitespace-nowrap text-slate-500">{score}/{safeMax}{level ? ` · ${level}` : ""}</span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label={`${label}评分`}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={score}
      >
        <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-violet-500 transition-[width]" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
