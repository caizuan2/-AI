import { CircleCheck, TriangleAlert } from "lucide-react";

export function FormMessage({ message, tone = "error" }: { message: string; tone?: "error" | "success" }) {
  const success = tone === "success";
  const Icon = success ? CircleCheck : TriangleAlert;
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${success ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="whitespace-pre-line">{message}</span>
    </div>
  );
}
