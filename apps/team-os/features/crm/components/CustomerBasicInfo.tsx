import { MessageCircle, Phone, StickyNote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CustomerRecord } from "@/apps/team-os/features/crm/types";

export function CustomerBasicInfo({ customer }: { customer: CustomerRecord }) {
  return (
    <Card>
      <CardHeader><CardTitle>客户基础信息</CardTitle></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 rounded-xl bg-slate-50 p-4"><p className="flex items-center gap-2 text-xs text-slate-500"><Phone className="h-4 w-4" aria-hidden="true" />手机号</p><p className="mt-2 break-all text-sm font-medium text-slate-800">{customer.phone || "未填写"}</p></div>
        <div className="min-w-0 rounded-xl bg-slate-50 p-4"><p className="flex items-center gap-2 text-xs text-slate-500"><MessageCircle className="h-4 w-4" aria-hidden="true" />微信号</p><p className="mt-2 break-all text-sm font-medium text-slate-800">{customer.wechat || "未填写"}</p></div>
        <div className="min-w-0 rounded-xl bg-slate-50 p-4 sm:col-span-2"><p className="text-xs text-slate-500">客户来源</p><p className="mt-2 break-words text-sm text-slate-800 [overflow-wrap:anywhere]">{customer.source || "未填写"}</p></div>
        <div className="min-w-0 rounded-xl bg-slate-50 p-4 sm:col-span-2"><p className="flex items-center gap-2 text-xs text-slate-500"><StickyNote className="h-4 w-4" aria-hidden="true" />备注</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 [overflow-wrap:anywhere]">{customer.notes || "暂无备注。"}</p></div>
      </CardContent>
    </Card>
  );
}
