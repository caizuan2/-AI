"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Database, Loader2, MessageSquareText, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizePhone, validatePhone } from "@/lib/auth/phone";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type VerifyMode = "login" | "register";

const RESEND_SECONDS = 60;

function getMode(value: string | null): VerifyMode {
  return value === "register" ? "register" : "login";
}

function VerifyPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = useMemo(() => normalizePhone(searchParams.get("phone") ?? ""), [searchParams]);
  const mode = getMode(searchParams.get("mode"));
  const [token, setToken] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const phoneIsValid = validatePhone(phone);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!phoneIsValid) {
      setError("手机号无效，请返回重新输入。");
      return;
    }

    if (!token.trim()) {
      setError("请输入短信验证码。");
      return;
    }

    setVerifying(true);
    setError("");
    setMessage("");

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone,
        token: token.trim(),
        type: "sms"
      });

      if (verifyError) {
        setError("验证码错误或已过期。");
        return;
      }

      setMessage("验证成功，正在进入首页。");
      router.push("/");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "验证失败，请稍后重试。");
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    if (!phoneIsValid || secondsLeft > 0) {
      return;
    }

    setResending(true);
    setError("");
    setMessage("");

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: resendError } = await supabase.auth.signInWithOtp({
        phone,
        options: {
          shouldCreateUser: mode === "register"
        }
      });

      if (resendError) {
        setError("短信验证码发送失败，请检查手机号或短信服务配置。");
        return;
      }

      setSecondsLeft(RESEND_SECONDS);
      setMessage("短信验证码已发送。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "重新发送失败，请稍后重试。");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-soft sm:p-8">
      <div className="mb-8 lg:hidden">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-white">
          <Database className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold text-ink">AI 知识库</h1>
      </div>

      <div>
        <p className="text-sm font-medium text-teal-700">短信验证</p>
        <h2 className="mt-2 text-3xl font-semibold text-ink">验证并登录</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          验证码已发送至 {phoneIsValid ? phone : "无效手机号"}
        </p>
      </div>

      <form onSubmit={verify} className="mt-8 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-ink">验证码</span>
          <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
            <MessageSquareText className="h-4 w-4 text-muted" />
            <Input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
              placeholder="请输入短信验证码"
            />
          </span>
        </label>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-sm text-teal-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {message}
          </div>
        ) : null}

        <Button type="submit" disabled={verifying || !phoneIsValid} className="h-11 w-full">
          {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          验证并登录
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={resending || secondsLeft > 0 || !phoneIsValid}
          onClick={resend}
          className="h-11 w-full"
        >
          {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {secondsLeft > 0 ? `${secondsLeft} 秒后重新发送` : "重新发送验证码"}
        </Button>

        <p className="text-center text-sm text-muted">
          手机号不对？
          <Link href={mode === "register" ? "/register" : "/login"} className="font-medium text-teal-700 hover:text-teal-800">
            返回重新输入
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-ink px-10 py-10 text-white lg:flex lg:flex-col">
        <div className="login-grid absolute inset-0 opacity-[0.08]" />
        <div className="relative z-10 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-ink">
            <Database className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-semibold">AI 知识库</p>
            <p className="text-xs text-slate-300">Knowledge Ops Console</p>
          </div>
        </div>

        <div className="relative z-10 mt-auto max-w-2xl pb-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-teal-100 ring-1 ring-white/15">
            <MessageSquareText className="h-4 w-4" />
            SMS Verification
          </div>
          <h1 className="text-5xl font-semibold leading-tight">
            输入短信验证码，进入知识库工作台。
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            Supabase Phone Auth 使用一次性验证码完成登录和注册。
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <Suspense fallback={<div className="text-sm text-muted">加载验证页面...</div>}>
          <VerifyPanel />
        </Suspense>
      </section>
    </main>
  );
}
