import { ArrowRight, Boxes, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const foundations = [
  { title: "独立应用边界", detail: "路由、组件与服务均位于 Team OS 专属目录。", icon: Boxes },
  { title: "权限角色准备", detail: "四类团队角色已建立，不改变原有用户权限。", icon: ShieldCheck },
  { title: "API 状态就绪", detail: "模块状态接口用于部署与运行检查。", icon: Sparkles }
];

export function DevelopmentState() {
  return (
    <div className="mx-auto max-w-7xl pb-20 lg:pb-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="bg-indigo-50 text-indigo-700">Phase 0 基础架构</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">AI Team OS</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            面向企业团队的 AI 智能运营工作台。基础架构已经建立，业务能力将在后续阶段逐步开放。
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-500">
          系统状态：功能开发中
          <span className="h-2 w-2 rounded-full bg-amber-400" />
        </div>
      </div>

      <Card className="mt-8 overflow-hidden border-slate-200 bg-gradient-to-br from-slate-950 to-slate-800 text-white shadow-xl shadow-slate-200/70">
        <CardContent className="flex min-h-64 flex-col justify-between p-7 sm:p-10">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10">
            <Sparkles className="h-6 w-6 text-indigo-300" aria-hidden="true" />
          </div>
          <div className="mt-12">
            <p className="text-sm font-medium text-indigo-300">AI-native team operations</p>
            <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">功能开发中</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
              任务中心、AI 教练、AI CRM、培训中心和数据中心将在下一阶段接入。
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {foundations.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className="border-slate-200">
              <CardHeader>
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="pt-3">{item.title}</CardTitle>
                <CardDescription>{item.detail}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  基础能力已就绪 <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
