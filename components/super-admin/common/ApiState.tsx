import type { ReactNode } from "react";

type ApiStateProps = {
  title: string;
  description: string;
  tone?: "slate" | "amber" | "rose";
  action?: ReactNode;
};

const toneClasses = {
  slate: "border-slate-200 bg-white text-slate-600",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  rose: "border-rose-200 bg-rose-50 text-rose-800"
};

export function ApiState({ title, description, tone = "slate", action }: ApiStateProps) {
  return (
    <section className={`rounded-lg border p-6 shadow-sm ${toneClasses[tone]}`}>
      <h2 className="text-base font-semibold tracking-normal text-slate-950">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}

export function LoadingState({ title = "正在加载超级管理员数据" }: { title?: string }) {
  return (
    <ApiState
      title={title}
      description="正在从超级管理员 API 获取数据，请稍候。"
    />
  );
}

export function UnauthorizedState() {
  return (
    <ApiState
      tone="amber"
      title="请使用超级管理员登录后查看此页面数据"
      description="当前请求未通过 super_admin 权限校验。页面已安全拦截数据展示，不会绕过登录或权限系统。"
    />
  );
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <ApiState
      tone="rose"
      title="数据加载失败"
      description={message ?? "请稍后重试，或检查 super-admin API 是否可用。"}
    />
  );
}

export function EmptyState({ message = "暂无可展示数据" }: { message?: string }) {
  return (
    <ApiState
      title="暂无数据"
      description={message}
    />
  );
}
