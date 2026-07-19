import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotificationPreferenceCard({
  icon: Icon,
  label,
  description,
  enabled,
  disabled = false,
  onToggle
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-950">{label}</p>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      <Button
        variant={enabled ? "secondary" : "outline"}
        size="sm"
        role="switch"
        aria-checked={enabled}
        aria-label={`${label}通知${enabled ? "已开启" : "已关闭"}`}
        disabled={disabled}
        onClick={onToggle}
      >
        {enabled ? "已开启" : "已关闭"}
      </Button>
    </div>
  );
}
