"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Building2,
  LockKeyhole,
  Phone,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UsersRound
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TEAM_OS_INVITE_PATH,
  TEAM_OS_REGISTER_PATH
} from "@/apps/team-os/features/auth/constants";
import type { TeamOsAccessDecision } from "@/apps/team-os/features/auth/services/team-os-access";
import {
  getSafeTeamOsNextPath,
  isTeamOsInvitationNextPath
} from "@/apps/team-os/features/auth/utils/team-os-next-path";
import { unwrapApiResponse } from "@/lib/api/client";

interface LoginResponse {
  success: true;
}

function TeamOsLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getNextPath = useCallback(
    () => getSafeTeamOsNextPath(searchParams.get("next")),
    [searchParams]
  );

  const getTeamOsDestination = useCallback(async () => {
    const response = await fetch("/api/team-os/auth/access", {
      method: "GET",
      cache: "no-store"
    });
    const decision = await unwrapApiResponse<TeamOsAccessDecision>(
      response,
      "无法检查 AI Team OS 企业权限，请稍后重试。"
    );

    const requestedNextPath = getNextPath();
    if (isTeamOsInvitationNextPath(requestedNextPath)) {
      return requestedNextPath;
    }

    return decision.allowed ? requestedNextPath : decision.nextPath;
  }, [getNextPath]);

  useEffect(() => {
    let active = true;

    async function checkExistingSession() {
      try {
        const response = await fetch("/api/auth/me", {
          method: "GET",
          cache: "no-store"
        });

        if (!active) {
          return;
        }

        if (response.ok) {
          router.replace(await getTeamOsDestination());
          router.refresh();
          return;
        }
      } catch (caughtError) {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "无法检查 AI Team OS 企业权限，请稍后重试。"
          );
        }
      }

      if (active) {
        setCheckingSession(false);
      }
    }

    void checkExistingSession();

    return () => {
      active = false;
    };
  }, [getTeamOsDestination, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!phone.trim() || !password) {
      setError("请输入手机号和密码。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phone,
          password
        })
      });

      await unwrapApiResponse<LoginResponse>(response, "手机号或密码错误。");
      router.replace(await getTeamOsDestination());
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "网络错误，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="mt-8 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-5 text-center text-sm text-indigo-700">
        正在检查企业账号状态...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-800">手机号</span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
          <Phone className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="username"
            autoFocus
            className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            placeholder="请输入手机号"
          />
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-800">密码</span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
          <LockKeyhole className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <Input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            placeholder="请输入密码"
          />
        </span>
      </label>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <Button
        type="submit"
        disabled={loading}
        className="h-11 w-full bg-indigo-600 text-white hover:bg-indigo-700"
      >
        {loading ? "正在登录" : "进入 AI Team OS"}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-sm sm:grid-cols-2">
        <Link
          href={TEAM_OS_REGISTER_PATH}
          className="rounded-lg px-3 py-2 font-medium text-indigo-700 hover:bg-white hover:text-indigo-800"
        >
          没有企业账号？注册并开通
        </Link>
        <Link
          href={TEAM_OS_INVITE_PATH}
          className="rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-white hover:text-indigo-800"
        >
          已有企业邀请？接受邀请
        </Link>
      </div>

      <p className="text-center text-sm text-slate-500">
        需要进入原知识库？
        <Link href="/login" className="font-medium text-indigo-700 hover:text-indigo-800">
          返回小董AI登录
        </Link>
      </p>
    </form>
  );
}

export function TeamOsLoginPage() {
  return (
    <main className="grid min-h-dvh bg-slate-50 lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden overflow-hidden bg-slate-950 px-10 py-10 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.38),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.2),transparent_38%)]" />
        <div className="relative z-10 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-500 shadow-lg shadow-indigo-950/40">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-base font-semibold">AI Team OS</p>
            <p className="text-xs text-slate-300">AI 团队智能运营系统</p>
          </div>
        </div>

        <div className="relative z-10 mt-auto max-w-2xl pb-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-indigo-100 ring-1 ring-white/15">
            <Building2 className="h-4 w-4" aria-hidden="true" />
            企业智能运营工作台
          </div>
          <h1 className="text-5xl font-semibold leading-tight">让团队协作、执行与增长持续在线</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            一个入口连接任务管理、AI 教练、客户运营、培训和企业数据，让每个角色都能获得清晰的下一步。
          </p>

          <div className="mt-10 grid max-w-xl grid-cols-2 gap-3 text-sm text-slate-200">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <UsersRound className="h-4 w-4 text-indigo-300" aria-hidden="true" />
              统一团队入口
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <ShieldCheck className="h-4 w-4 text-indigo-300" aria-hidden="true" />
              企业权限隔离
            </div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
          <div className="mb-8 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <h1 className="mt-4 text-2xl font-semibold text-slate-950">AI Team OS</h1>
            <p className="mt-1 text-sm text-slate-500">AI 团队智能运营系统</p>
          </div>

          <div>
            <p className="text-sm font-medium text-indigo-700">企业专属入口</p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">登录 AI Team OS</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              使用现有企业账号登录，进入与你角色和团队权限匹配的智能运营工作台。
            </p>
          </div>

          <Suspense fallback={<div className="mt-8 text-sm text-slate-500">正在加载登录表单...</div>}>
            <TeamOsLoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
