"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  KeyRound,
  Loader2,
  LockKeyhole,
  Phone,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapApiResponse } from "@/lib/api/client";

type IngestAuthMode = "login" | "register" | "activate" | "reset";

type IngestAuthUser = {
  id: string;
  phone: string;
  name: string;
  isActive?: boolean;
  licenseActivated: boolean;
  hasIngestAccess?: boolean;
  isSuperAdmin?: boolean;
  roles?: string[];
};

type IngestAuthResponse = {
  success: true;
  sessionToken?: string;
  licenseActivated: boolean;
  hasIngestAccess?: boolean;
  user: IngestAuthUser;
};

type IngestAuthMeState = {
  success: boolean;
  authenticated: boolean;
  activated: boolean;
  licenseActivated: boolean;
  hasIngestAccess: boolean;
  role: string | null;
  roles: string[];
  user: IngestAuthUser | null;
  errorCode?: string;
  message?: string;
};

const modeCopy: Record<IngestAuthMode, {
  eyebrow: string;
  title: string;
  description: string;
  sideTitle: string;
  sideDescription: string;
  cta: string;
}> = {
  login: {
    eyebrow: "欢迎回来",
    title: "登录投喂工作台",
    description: "登录后会检查卡密状态，已激活账号可直接进入 admin-ingest。",
    sideTitle: "用账号和卡密保护你的投喂系统。",
    sideDescription: "商业化入口会先校验登录态，再校验投喂端卡密激活状态。",
    cta: "登录"
  },
  register: {
    eyebrow: "",
    title: "",
    description: "",
    sideTitle: "注册、激活、进入工作台，一条商业闭环。",
    sideDescription: "注册时绑定有效投喂端卡密，成功后即可进入 admin-ingest。",
    cta: "注册并激活"
  },
  activate: {
    eyebrow: "卡密激活",
    title: "激活投喂权限",
    description: "请输入超级管理员生成的投喂端卡密，激活后自动进入工作台。",
    sideTitle: "卡密就是 SaaS 权限入口。",
    sideDescription: "有效卡密会绑定当前账号，并授予管理员投喂版访问权限。",
    cta: "激活并进入"
  },
  reset: {
    eyebrow: "账号安全",
    title: "找回投喂端密码",
    description: "使用该账号原先激活的投喂端卡密验证身份并设置新密码。",
    sideTitle: "卡密验证账号归属，安全找回访问权限。",
    sideDescription: "手机号与原投喂端卡密必须属于同一账号；重置成功后需使用新密码重新登录。",
    cta: "设置新密码"
  }
};

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "";
  }

  const pathname = value.split("?")[0] || value;

  if (
    pathname === "/ingest/login" ||
    pathname.startsWith("/ingest/login/") ||
    pathname === "/ingest/register" ||
    pathname.startsWith("/ingest/register/") ||
    pathname === "/ingest/activate" ||
    pathname.startsWith("/ingest/activate/") ||
    pathname === "/ingest/forgot-password" ||
    pathname.startsWith("/ingest/forgot-password/")
  ) {
    return "";
  }

  return value;
}

function getNextWithFallback(searchParams: ReturnType<typeof useSearchParams>) {
  return safeNextPath(searchParams.get("next") || searchParams.get("redirectTo")) || "/admin-ingest?app=ingest-admin&platform=web";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeAuthMePayload(payload: unknown): IngestAuthMeState | null {
  if (!isRecord(payload)) {
    return null;
  }

  const source = isRecord(payload.data) ? payload.data : payload;
  const user = isRecord(source.user) ? source.user as IngestAuthUser : null;
  const authenticated = typeof source.authenticated === "boolean" ? source.authenticated : Boolean(user);
  const licenseActivated = source.licenseActivated === true || user?.licenseActivated === true;
  const activated = source.activated === true || licenseActivated;
  const roles = Array.isArray(source.roles)
    ? source.roles.filter((role): role is string => typeof role === "string")
    : Array.isArray(user?.roles)
      ? user.roles.filter((role): role is string => typeof role === "string")
      : [];
  const hasPrivilegedIngestRole = roles.some((role) => role === "super_admin" || role === "ingest_admin" || role === "kb_admin");
  const hasIngestAccess = source.hasIngestAccess === true || (authenticated && hasPrivilegedIngestRole && activated);
  const role = typeof source.role === "string" ? source.role : null;
  const errorCode = typeof source.errorCode === "string" ? source.errorCode : undefined;
  const message = typeof source.message === "string" ? source.message : undefined;

  return {
    success: source.success !== false,
    authenticated,
    activated,
    licenseActivated,
    hasIngestAccess,
    role,
    roles,
    user,
    errorCode,
    message
  };
}

async function fetchAuthMeWithTimeout(timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch("/api/ingest/auth/me", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function IngestSaasAuthPortal({ mode }: { mode: IngestAuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const copy = modeCopy[mode];
  const nextPath = useMemo(() => getNextWithFallback(searchParams), [searchParams]);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [checkError, setCheckError] = useState("");
  const passwordReset = mode === "login" && searchParams.get("passwordReset") === "1";

  const goNext = useCallback((hasIngestAccess: boolean) => {
    router.replace(hasIngestAccess ? nextPath : `/ingest/activate?next=${encodeURIComponent(nextPath)}`);
    router.refresh();
  }, [nextPath, router]);

  useEffect(() => {
    let active = true;
    const checkTimeoutId = window.setTimeout(() => {
      if (!active) {
        return;
      }

      if (mode === "activate") {
        router.replace(`/ingest/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      setCheckError("");
      setChecking(false);
    }, 5200);

    async function checkSession() {
      try {
        setCheckError("");
        const response = await fetchAuthMeWithTimeout(5000);

        if (!active) {
          return;
        }

        window.clearTimeout(checkTimeoutId);
        const payload = await response.json().catch(() => null);
        const authState = normalizeAuthMePayload(payload);

        if (!response.ok || !authState || !authState.success) {
          throw new Error(authState?.message || "登录状态检查失败，请重新登录。");
        }

        if (!authState.authenticated) {
          if (mode === "activate") {
            router.replace(`/ingest/login?next=${encodeURIComponent(nextPath)}`);
            return;
          }

          setChecking(false);
          return;
        }

        if (mode === "activate") {
          if (authState.hasIngestAccess) {
            goNext(true);
            return;
          }

          setChecking(false);
          return;
        }

        goNext(authState.hasIngestAccess);
        return;
      } catch {
        if (!active) {
          return;
        }

        window.clearTimeout(checkTimeoutId);
        if (mode === "activate") {
          router.replace(`/ingest/login?next=${encodeURIComponent(nextPath)}`);
          return;
        }

        setCheckError("登录状态检查失败，请重新登录。");
        setChecking(false);
      }
    }

    void checkSession();

    return () => {
      active = false;
      window.clearTimeout(checkTimeoutId);
    };
  }, [goNext, mode, nextPath, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode !== "activate" && (!username.trim() || !password)) {
      setError("请输入手机号和密码。");
      return;
    }

    if ((mode === "register" || mode === "reset") && password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    if ((mode === "activate" || mode === "register" || mode === "reset") && !licenseKey.trim()) {
      setError("请输入投喂端卡密。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const endpoint = mode === "login"
        ? "/api/ingest/auth/login"
        : mode === "register"
          ? "/api/ingest/auth/register"
          : mode === "reset"
            ? "/api/ingest/auth/reset-password"
            : "/api/ingest/auth/activate-license";
      const body = mode === "activate"
        ? { licenseKey, appType: "ingest_admin", app: "ingest_admin" }
        : mode === "reset"
          ? {
              phone: username,
              licenseKey,
              newPassword: password,
              confirmPassword
            }
        : {
            name,
            username,
            phone: username,
            password,
            confirmPassword,
            ...(mode === "register" ? { licenseKey } : {})
          };
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      if (mode === "reset") {
        await unwrapApiResponse<{ reset: true; sessionsRevoked: true }>(response, "密码重置失败，请稍后重试。");
        router.replace(`/ingest/login?passwordReset=1&next=${encodeURIComponent(nextPath)}`);
        router.refresh();
        return;
      }

      const data = await unwrapApiResponse<IngestAuthResponse>(response, "请求失败，请稍后重试。");
      const hasIngestAccess = data.hasIngestAccess
        ?? data.user.hasIngestAccess
        ?? (data.licenseActivated || data.user.licenseActivated);

      goNext(hasIngestAccess);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "网络错误，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function goBackFromActivate() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
    } catch {
      // Still let the user leave the activation gate if logout fails.
    }

    router.replace(`/ingest/login?app=ingest-admin&next=${encodeURIComponent(nextPath)}`);
    router.refresh();
  }

  return (
    <main data-ui-health="ingest-auth-portal" className="grid min-h-dvh bg-[#f6f7f4] text-[#1f2926] lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#111816] px-10 py-10 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:34px_34px]" />
        <div className="relative z-10 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#dff8ec] text-[#134e3a]">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-semibold">AI 投喂 SaaS</p>
            <p className="text-xs text-slate-300">Admin Ingest Portal</p>
          </div>
        </div>

        <div className="relative z-10 mt-auto max-w-2xl pb-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-emerald-100 ring-1 ring-white/15">
            <ShieldCheck className="h-4 w-4" />
            License Gate
          </div>
          <h1 className="text-5xl font-semibold leading-tight">{copy.sideTitle}</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">{copy.sideDescription}</p>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div data-ui-health="ingest-auth-card" className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-6 shadow-[0_18px_70px_rgba(15,23,42,.08)] sm:p-8">
          <div className="mb-8 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#111816] text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            <h1 className="mt-4 text-2xl font-semibold">AI 投喂 SaaS</h1>
          </div>

          {mode === "activate" ? (
            <button
              type="button"
              onClick={goBackFromActivate}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              返回上一步
            </button>
          ) : null}

          {mode !== "register" ? (
            <div>
              <p className="text-sm font-medium text-emerald-700">{copy.eyebrow}</p>
              <h2 className="mt-2 text-3xl font-semibold">{copy.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{copy.description}</p>
            </div>
          ) : null}

          {checking ? (
            <div className="mt-8 flex items-center justify-center gap-2 rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在检查登录状态...
            </div>
          ) : checkError ? (
            <div className="mt-8 space-y-4">
              <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{checkError}</span>
              </div>
              <Button
                type="button"
                onClick={() => router.replace(`/ingest/login?app=ingest-admin&next=${encodeURIComponent("/ingest/activate")}`)}
                className="h-11 w-full rounded-2xl bg-[#111816] hover:bg-[#1d2a26]"
              >
                返回登录
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className={mode === "register" ? "space-y-4" : "mt-8 space-y-4"}>
              {passwordReset ? (
                <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  密码已重置，请使用新密码登录。
                </div>
              ) : null}
              {mode === "register" ? (
                <label className="block">
                  <span className="text-sm font-medium">姓名</span>
                  <span className="mt-2 flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
                    <UserRound className="h-4 w-4 text-slate-400" />
                    <Input
                      name="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                      className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                      placeholder="你的姓名（可选）"
                    />
                  </span>
                </label>
              ) : null}

              {mode !== "activate" ? (
                <>
                  <label className="block">
                    <span className="text-sm font-medium">手机号 / 用户名</span>
                    <span className="mt-2 flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <Input
                        name="phone"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                        placeholder="请输入手机号"
                      />
                    </span>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium">{mode === "reset" ? "新密码" : "密码"}</span>
                    <span className="mt-2 flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
                      <LockKeyhole className="h-4 w-4 text-slate-400" />
                      <Input
                        name={mode === "reset" ? "newPassword" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        type="password"
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                        placeholder={mode === "login" ? "请输入密码" : "至少 8 位"}
                      />
                    </span>
                  </label>
                </>
              ) : null}

              {mode === "register" || mode === "reset" ? (
                <label className="block">
                  <span className="text-sm font-medium">{mode === "reset" ? "确认新密码" : "确认密码"}</span>
                  <span className="mt-2 flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
                    <LockKeyhole className="h-4 w-4 text-slate-400" />
                    <Input
                      name="confirmPassword"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      type="password"
                      autoComplete="new-password"
                      className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                      placeholder="再次输入密码"
                    />
                  </span>
                </label>
              ) : null}

              {mode === "activate" || mode === "register" || mode === "reset" ? (
                <label className="block">
                  <span className="text-sm font-medium">{mode === "reset" ? "原投喂端卡密" : "投喂端卡密"}</span>
                  <span className="mt-2 flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
                    <KeyRound className="h-4 w-4 text-slate-400" />
                    <Input
                      name="licenseKey"
                      value={licenseKey}
                      onChange={(event) => setLicenseKey(event.target.value)}
                      autoComplete="one-time-code"
                      className="h-auto border-0 bg-transparent p-0 font-mono shadow-none focus-visible:ring-0"
                      placeholder="XT-INGEST-XXXX-XXXX-XXXX"
                    />
                  </span>
                </label>
              ) : null}

              {error ? (
                <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="whitespace-pre-line">{error}</span>
                </div>
              ) : null}

              <Button type="submit" disabled={loading} className="h-11 w-full rounded-2xl bg-[#111816] hover:bg-[#1d2a26]">
                {loading ? "处理中..." : copy.cta}
                {mode === "activate" ? <BadgeCheck className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              </Button>

              {mode === "login" ? (
                <div className="space-y-2 text-center text-sm text-slate-500">
                  <p>
                    <Link href={`/ingest/forgot-password?next=${encodeURIComponent(nextPath)}`} className="font-medium text-emerald-700 hover:text-emerald-800">
                      忘记密码？
                    </Link>
                  </p>
                  <p>
                    没有账号？
                    <Link href={`/ingest/register?next=${encodeURIComponent(nextPath)}`} className="font-medium text-emerald-700 hover:text-emerald-800">
                      去注册
                    </Link>
                  </p>
                </div>
              ) : null}

              {mode === "register" ? (
                <p className="text-center text-sm text-slate-500">
                  已有账号？
                  <Link href={`/ingest/login?next=${encodeURIComponent(nextPath)}`} className="font-medium text-emerald-700 hover:text-emerald-800">
                    去登录
                  </Link>
                </p>
              ) : null}

              {mode === "reset" ? (
                <p className="text-center text-sm text-slate-500">
                  想起密码了？
                  <Link href={`/ingest/login?next=${encodeURIComponent(nextPath)}`} className="font-medium text-emerald-700 hover:text-emerald-800">
                    返回登录
                  </Link>
                </p>
              ) : null}
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
