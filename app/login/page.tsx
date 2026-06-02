"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Database, Phone, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizePhone, validatePhone } from "@/lib/auth/phone";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function getOtpErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("signups not allowed") || normalized.includes("user not found")) {
    return "该手机号尚未注册，请先注册。";
  }

  if (normalized.includes("sms") || normalized.includes("phone")) {
    return "短信验证码发送失败，请检查手机号或短信服务配置。";
  }

  return "发送验证码失败，请稍后重试。";
}

function LoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPhone = normalizePhone(phone);

    if (!validatePhone(normalizedPhone)) {
      setError("请输入合法手机号，例如 13812345678 或 +8613812345678。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
        options: {
          shouldCreateUser: false
        }
      });

      if (signInError) {
        setError(getOtpErrorMessage(signInError.message));
        return;
      }

      router.push(`/verify?phone=${encodeURIComponent(normalizedPhone)}&mode=login`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "发送验证码失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-ink">手机号</span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
          <Phone className="h-4 w-4 text-muted" />
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            placeholder="请输入手机号，例如 13812345678"
          />
        </span>
      </label>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <TriangleAlert className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      <Button type="submit" disabled={loading} className="h-11 w-full">
        {loading ? "正在发送" : "发送验证码"}
        <ArrowRight className="h-4 w-4" />
      </Button>

      <p className="text-center text-sm text-muted">
        没有账号？
        <Link href="/register" className="font-medium text-teal-700 hover:text-teal-800">
          去注册
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
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
            <Sparkles className="h-4 w-4" />
            Phone OTP
          </div>
          <h1 className="text-5xl font-semibold leading-tight">
            用手机号进入你的可追溯 AI 知识库。
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            登录后投喂、检索和问答都会按账号隔离。
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-soft sm:p-8">
          <div className="mb-8 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-white">
              <Database className="h-5 w-5" />
            </span>
            <h1 className="mt-4 text-2xl font-semibold text-ink">AI 知识库</h1>
          </div>

          <div>
            <p className="text-sm font-medium text-teal-700">欢迎回来</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">手机号登录</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              使用短信验证码继续。
            </p>
          </div>

          <LoginForm />
        </div>
      </section>
    </main>
  );
}
