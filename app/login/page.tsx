"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LockKeyhole, Phone, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapApiResponse } from "@/lib/api/client";
import {
  getEntryPathForRole,
  getEntryRoleFromRoles,
  getProductFromPath,
  isPathAllowedForEntryRole,
  type EntryRole
} from "@/lib/auth/product";

interface LoginResponse {
  success: true;
  licenseActivated: boolean;
  isSuperAdmin?: boolean;
  role?: EntryRole;
  roles?: string[];
  entryPath?: string;
}

interface MeResponse {
  user: {
    licenseActivated: boolean;
    isSuperAdmin?: boolean;
    role?: EntryRole;
    roles?: string[];
    entryPath?: string;
  };
}

function getPostLoginPath(input: {
  nextPath?: string;
  licenseActivated?: boolean;
  isSuperAdmin?: boolean;
  role?: EntryRole;
  roles?: string[];
  entryPath?: string;
}) {
  const role = input.role ?? getEntryRoleFromRoles({
    roles: input.roles,
    isSuperAdmin: input.isSuperAdmin
  });
  const normalizedNextPath = input.nextPath?.split("?")[0] || "";
  const nextProduct = normalizedNextPath ? getProductFromPath(normalizedNextPath) : "public";

  if (
    input.nextPath &&
    !(normalizedNextPath === "/unlock" && input.licenseActivated) &&
    isPathAllowedForEntryRole(input.nextPath, role)
  ) {
    return input.nextPath;
  }

  if (role !== "user" && (!input.nextPath || nextProduct === "user_app")) {
    return "/no-access";
  }

  if (input.entryPath && isPathAllowedForEntryRole(input.entryPath, role)) {
    return input.entryPath;
  }

  return getEntryPathForRole(role, Boolean(input.licenseActivated));
}

function shouldStayOnUserLogin(input: {
  nextPath?: string;
  isSuperAdmin?: boolean;
  role?: EntryRole;
  roles?: string[];
}) {
  const role = input.role ?? getEntryRoleFromRoles({
    roles: input.roles,
    isSuperAdmin: input.isSuperAdmin
  });
  const normalizedNextPath = input.nextPath?.split("?")[0] || "";
  const nextProduct = normalizedNextPath ? getProductFromPath(normalizedNextPath) : "user_app";

  return role !== "user" && nextProduct === "user_app";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(false);
  const [error, setError] = useState("");
  const activated = searchParams.get("activated") === "1";

  const getSafeNextPath = useCallback(() => {
    const candidate = searchParams.get("next") || searchParams.get("redirectTo") || "";

    if (!candidate.startsWith("/") || candidate.startsWith("//")) {
      return "";
    }

    const pathname = candidate.split("?")[0] || candidate;

    if (pathname === "/login" || pathname.startsWith("/login/") || pathname === "/register" || pathname.startsWith("/register/")) {
      return "";
    }

    if (pathname === "/api" || pathname.startsWith("/api/")) {
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
          const currentUser = payload?.data?.user;

          if (!currentUser) {
            setCheckingSession(false);
            return;
          }

          if (shouldStayOnUserLogin({
            nextPath,
            isSuperAdmin: currentUser.isSuperAdmin,
            role: currentUser.role,
            roles: currentUser.roles
          })) {
            setCheckingSession(false);
            return;
          }

          router.replace(getPostLoginPath({
            nextPath,
            licenseActivated: currentUser.licenseActivated,
            isSuperAdmin: currentUser.isSuperAdmin,
            role: currentUser.role,
            roles: currentUser.roles,
            entryPath: currentUser.entryPath
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
        isSuperAdmin: data.isSuperAdmin,
        role: data.role,
        roles: data.roles,
        entryPath: data.entryPath
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
      {activated ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          激活成功，请重新登录进入小董AI用户端。
        </div>
      ) : null}

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
          <span className="relative block h-11 w-11 overflow-hidden rounded-xl bg-white ring-1 ring-white/30">
            <Image
              src="/brand/xiaodong-ai-logo.png"
              alt="小董AI Logo"
              fill
              sizes="44px"
              className="object-cover"
              priority
            />
          </span>
          <div>
            <p className="text-base font-semibold">小董AI</p>
            <p className="text-xs text-slate-300">小董AI大脑🧠 + AI思考</p>
          </div>
        </div>

        <div className="relative z-10 mt-auto max-w-2xl pb-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-teal-100 ring-1 ring-white/15">
            <Sparkles className="h-4 w-4" />
            GPT OS 用户端
          </div>
          <h1 className="text-5xl font-semibold leading-tight">
            小董AI，帮你处理客户问题
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            基于投喂知识库 + AI 思考，输出回复话术、解决步骤和下一步建议。
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-soft sm:p-8">
          <div className="mb-8 lg:hidden">
            <span className="relative block h-11 w-11 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
              <Image
                src="/brand/xiaodong-ai-logo.png"
                alt="小董AI Logo"
                fill
                sizes="44px"
                className="object-cover"
                priority
              />
            </span>
            <h1 className="mt-4 text-2xl font-semibold text-ink">小董AI</h1>
          </div>

          <div>
            <p className="text-sm font-medium text-teal-700">欢迎回来</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">登录小董AI</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              用手机号登录，进入你的 AI 业务助手。上传客户对话、输入业务问题，系统将调用企业知识库并生成可执行回复方案。
            </p>
          </div>

          <Suspense fallback={<div className="mt-8 text-sm text-muted">正在加载登录表单...</div>}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
