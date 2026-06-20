"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Database, LockKeyhole, Phone, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapApiResponse } from "@/lib/api/client";

interface LoginResponse {
  success: true;
  licenseActivated: boolean;
  isSuperAdmin?: boolean;
}

interface MeResponse {
  user: {
    licenseActivated: boolean;
    isSuperAdmin?: boolean;
  };
}

function getPostLoginPath(input: { nextPath?: string; licenseActivated?: boolean; isSuperAdmin?: boolean }) {
  if (input.nextPath) {
    return input.nextPath;
  }

  if (input.isSuperAdmin) {
    return "/super-admin";
  }

  return input.licenseActivated ? "/ingest" : "/unlock";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");

  const getSafeNextPath = useCallback(() => {
    const candidate = searchParams.get("next") || searchParams.get("redirectTo") || "";

    if (!candidate.startsWith("/") || candidate.startsWith("//")) {
      return "";
    }

    const pathname = candidate.split("?")[0] || candidate;

    if (pathname === "/login" || pathname.startsWith("/login/") || pathname === "/register" || pathname.startsWith("/register/")) {
      return "";
    }

    return candidate;
  }, [searchParams]);

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
          const payload = await response.json().catch(() => null) as {
            data?: MeResponse;
          } | null;
          const nextPath = getSafeNextPath();

          router.replace(getPostLoginPath({
            nextPath,
            licenseActivated: payload?.data?.user.licenseActivated,
            isSuperAdmin: payload?.data?.user.isSuperAdmin
          }));
          return;
        }

        setCheckingSession(false);
      } catch {
        if (active) {
          setCheckingSession(false);
        }
      }
    }

    void checkExistingSession();

    return () => {
      active = false;
    };
  }, [getSafeNextPath, router]);

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
      const data = await unwrapApiResponse<LoginResponse>(response, "手机号或密码错误。");
      const nextPath = getSafeNextPath();

      router.replace(getPostLoginPath({
        nextPath,
        licenseActivated: data.licenseActivated,
        isSuperAdmin: data.isSuperAdmin
      }));
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "网络错误，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="mt-8 rounded-lg border border-line bg-slate-50 px-4 py-5 text-center text-sm text-muted">
        正在检查登录状态...
      </div>
    );
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
            placeholder="请输入手机号，例如 13352833702"
          />
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink">密码</span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
          <LockKeyhole className="h-4 w-4 text-muted" />
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
          <TriangleAlert className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      <Button type="submit" disabled={loading} className="h-11 w-full">
        {loading ? "正在登录" : "登录"}
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
            License Gate
          </div>
          <h1 className="text-5xl font-semibold leading-tight">
            用手机号和密码进入你的 AI 知识库。
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            登录后输入卡密激活，即可使用投喂、检索和问答功能。
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
            <p className="mt-2 text-sm leading-6 text-muted">使用手机号和密码继续。</p>
          </div>

          <Suspense fallback={<div className="mt-8 text-sm text-muted">正在加载登录表单...</div>}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
