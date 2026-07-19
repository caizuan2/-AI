import { Lightbulb, MessageSquareQuote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CustomerFollowUpSuggestionRecord } from "@/apps/team-os/features/crm/types";

export function CustomerFollowUpSuggestion({ value }: { value: CustomerFollowUpSuggestionRecord }) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-emerald-700" aria-hidden="true" />AI 跟进建议</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="whitespace-pre-wrap break-words text-sm leading-7 text-emerald-950 [overflow-wrap:anywhere]">{value.suggestion}</p>
        <div className="rounded-xl bg-white p-4"><p className="flex items-center gap-2 text-xs font-medium text-emerald-700"><MessageSquareQuote className="h-4 w-4" aria-hidden="true" />推荐话术</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-800 [overflow-wrap:anywhere]">{value.recommendedScript}</p></div>
      </CardContent>
    </Card>
  );
}
