"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock3, Loader2, LogOut, Send, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unwrapApiResponse } from "@/lib/api/client";

type WaitlistUser = {
  email: string;
  name: string;
  betaRequestedAt: string | null;
};

type WaitlistApplyResponse = {
  betaAccess: boolean;
  betaRequestedAt: string | null;
  alreadyRequested: boolean;
};

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

export function WaitlistPanel({ user }: { user: WaitlistUser }) {
  const [requestedAt, setRequestedAt] = useState(user.betaRequestedAt);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function apply() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/waitlist/apply", {
        method: "POST"
      });
      const data = await unwrapApiResponse<WaitlistApplyResponse>(response, "申请测试资格失败。");

      if (data.betaAccess) {
        window.location.href = "/knowledge";
        return;
      }

      setRequestedAt(data.betaRequestedAt);
      setMessage(data.alreadyRequested ? "你已经提交过申请，我们会尽快处理。" : "申请已提交，我们会尽快为你开通。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "申请测试资格失败。");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoggingOut(true);

    await fetch("/api/auth/logout", {
      method: "POST"
    });

    window.location.href = "/login";
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-5xl items-center">
      <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-line bg-white p-6 shadow-soft sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-ink text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-teal-700">Beta Waitlist</p>
              <h1 className="text-2xl font-semibold text-ink">等待测试资格开通</h1>
            </div>
          </div>

          <p className="mt-6 max-w-2xl text-sm leading-6 text-muted">
            当前产品处于 Beta 灰度测试阶段。你的账号已经登录成功，但还没有获得测试资格。
            提交申请后，管理员会在后台审核并开通你的 `betaAccess`。
          </p>

          <div className="mt-6 rounded-lg border border-line bg-canvas p-4">
            <p className="text-sm font-semibold text-ink">{user.name}</p>
            <p className="mt-1 text-sm text-muted">{user.email}</p>
            {requestedAt ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-teal-700">
                <Clock3 className="h-4 w-4" />
                已于 {formatTime(requestedAt)} 提交申请
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted">
                <Clock3 className="h-4 w-4" />
                尚未提交测试资格申请
              </div>
            )}
          </div>

          {error ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <TriangleAlert className="h-4 w-4" />
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="mt-4 rounded-lg border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-700">
              {message}
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button onClick={apply} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {requestedAt ? "再次查看申请状态" : "申请测试资格"}
            </Button>
            <Button variant="outline" onClick={logout} disabled={loggingOut}>
              {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              退出登录
            </Button>
            <Link
              href="/feedback"
              className="focus-ring inline-flex h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50"
            >
              提交反馈
            </Link>
          </div>
        </section>

        <aside className="rounded-lg border border-line bg-ink p-6 text-white shadow-soft sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-teal-100 ring-1 ring-white/15">
            <Sparkles className="h-4 w-4" />
            Beta 测试说明
          </div>
          <h2 className="mt-6 text-3xl font-semibold leading-tight">我们正在分批开放知识库工作台。</h2>
          <div className="mt-6 space-y-4 text-sm leading-6 text-slate-300">
            <p>灰度期间，管理员会优先开通需要验证投喂、检索、RAG 问答和导入导出的测试账号。</p>
            <p>获得资格后，你再次访问工作台会自动进入知识库页面。</p>
            <p>
              已经是管理员？
              <Link href="/admin" className="ml-1 font-medium text-teal-100 underline underline-offset-4">
                进入管理后台
              </Link>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
