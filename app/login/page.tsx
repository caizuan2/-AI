"use client";

import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, KeyRound, LockKeyhole, Phone, Sparkles, TriangleAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClientError, unwrapApiResponse } from "@/lib/api/client";
import { getUserEntryErrorFeedback, readUserEntryErrorMessage } from "@/app/login/user-entry-feedback";
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
  entryMode?: "login" | "created" | "reactivated";
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

type LoginTechnicalError = {
  code?: string;
  requestId?: string;
};

const USER_LICENSE_RECOVERY_CODES: readonly string[] = [
  "LICENSE_REQUIRED",
  "LICENSE_DISABLED",
  "LICENSE_EXPIRED"
];

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

  if (role === "user" && !input.licenseActivated) {
    return "/unlock";
  }

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
  const activated = searchParams.get("activated") === "1";
  const passwordReset = searchParams.get("reset") === "1";
  const firstUse = searchParams.get("first") === "1";
  const activationRequested = searchParams.get("activation") === "1";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [showLicenseEntry, setShowLicenseEntry] = useState(firstUse || activationRequested);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const [technicalError, setTechnicalError] = useState<LoginTechnicalError | null>(null);
  const nameFieldRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

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

  useEffect(() => {
    if (!nameError || !showLicenseEntry) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      nameFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      nameInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [nameError, showLicenseEntry]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading || submittingRef.current) {
      return;
    }

    setNameError("");
    setTechnicalError(null);

    if (!phone.trim() || !password) {
      setError("请输入手机号和密码。");
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError("");

    try {
      const response = await fetch(isAdminEntry ? "/api/auth/login" : "/api/auth/user-entry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...(!isAdminEntry && showLicenseEntry ? { name } : {}),
          phone,
          password,
          ...(!isAdminEntry ? { licenseKey } : {})
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
      if (!isAdminEntry && caughtError instanceof ApiClientError) {
        const feedback = getUserEntryErrorFeedback({
          code: caughtError.details.code,
          status: caughtError.details.status,
          message: readUserEntryErrorMessage(caughtError.details.body)
        });

        if (
          feedback.revealLicenseEntry ||
          USER_LICENSE_RECOVERY_CODES.includes(caughtError.details.code)
        ) {
          setShowLicenseEntry(true);
        }

        setNameError(feedback.nameError ?? "");
        setTechnicalError({
          code: caughtError.details.code,
          requestId: caughtError.details.requestId
        });
        setError(feedback.message);
      } else if (!isAdminEntry) {
        setError(getUserEntryErrorFeedback({ networkError: true }).message);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : "网络错误，请稍后重试。");
      }
    } finally {
      submittingRef.current = false;
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

  const safeNextPath = getSafeNextPath();
  const requestedApp = (searchParams.get("app") || "").trim().toLowerCase();
  const nextPathname = safeNextPath.split("?")[0] || safeNextPath;
  const nextProduct = safeNextPath ? getProductFromPath(nextPathname) : "user_app";
  const isLegacyAdminPath = nextPathname === "/admin" || nextPathname.startsWith("/admin/");
  const isAdminEntry =
    requestedApp.includes("admin") ||
    requestedApp.includes("ingest") ||
    requestedApp.includes("super") ||
    isLegacyAdminPath ||
    nextProduct === "ingest_admin" ||
    nextProduct === "super_admin";
  const forgotPasswordHref = safeNextPath
    ? `/forgot-password?next=${encodeURIComponent(safeNextPath)}`
    : "/forgot-password";
  const continuingActivation = searchParams.get("activation") === "1" || nextPathname === "/unlock";

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      {activated ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          激活成功，请重新登录进入小董AI用户端。
        </div>
      ) : null}

      {passwordReset && !isAdminEntry ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          密码重置成功，请使用新密码登录。
        </div>
      ) : null}

      {firstUse && !isAdminEntry ? (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm leading-6 text-teal-800">
          首次使用请输入手机号、密码和用户端卡密，系统会自动判断是否为新账号；新账号还需填写网名。
        </div>
      ) : null}

      {continuingActivation && !isAdminEntry ? (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm leading-6 text-teal-800">
          请输入原账号的手机号和密码，并填写新的有效用户端卡密重新激活。
        </div>
      ) : null}

      {!isAdminEntry && showLicenseEntry ? (
        <div ref={nameFieldRef} className="block">
          <label htmlFor="login-name" className="text-sm font-medium text-ink">
            网名（首次开户必填，原账号换卡恢复可不填）
          </label>
          <span
            className={`mt-2 flex h-11 items-center gap-2 rounded-lg border bg-white px-3 ${
              nameError ? "border-rose-300" : "border-line"
            }`}
          >
            <UserRound className="h-4 w-4 text-muted" />
            <Input
              ref={nameInputRef}
              id="login-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);

                if (nameError) {
                  setNameError("");
                  setError("");
                  setTechnicalError(null);
                }
              }}
              autoComplete="nickname"
              maxLength={50}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? "login-name-error" : "login-name-help"}
              className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
              placeholder="填写网名"
            />
          </span>
          {nameError ? (
            <p id="login-name-error" className="mt-1.5 text-xs leading-5 text-rose-700">
              {nameError}
            </p>
          ) : (
            <p id="login-name-help" className="mt-1.5 text-xs leading-5 text-muted">
              新账号首次开户时填写；原账号使用新卡恢复时留空即可，不会修改原网名。
            </p>
          )}
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
            placeholder="请输入手机号"
          />
        </span>
      </label>

      <div className="block">
        <span className="flex items-center justify-between gap-3">
          <label htmlFor="login-password" className="text-sm font-medium text-ink">密码</label>
          {!isAdminEntry ? (
            <Link href={forgotPasswordHref} className="inline-flex min-h-11 items-center text-sm font-medium text-teal-700 hover:text-teal-800">
              忘记密码？
            </Link>
          ) : null}
        </span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
          <LockKeyhole className="h-4 w-4 text-muted" />
          <Input
            id="login-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            placeholder={showLicenseEntry && !isAdminEntry ? "请输入密码（首次使用至少 8 位）" : "请输入密码"}
          />
        </span>
      </div>

      {!isAdminEntry && !showLicenseEntry ? (
        <button
          type="button"
          onClick={() => {
            setShowLicenseEntry(true);
            setError("");
            setNameError("");
            setTechnicalError(null);
          }}
          className="flex min-h-11 w-full items-center justify-center text-sm font-medium text-teal-700 hover:text-teal-800"
        >
          首次使用或卡密失效？输入卡密
        </button>
      ) : null}

      {!isAdminEntry && showLicenseEntry ? (
        <div className="block">
          <span className="flex items-center justify-between gap-3">
            <label htmlFor="login-license-key" className="text-sm font-medium text-ink">用户端卡密</label>
            {!firstUse && !activationRequested ? (
              <button
                type="button"
                onClick={() => {
                  setShowLicenseEntry(false);
                  setLicenseKey("");
                  setError("");
                  setNameError("");
                  setTechnicalError(null);
                }}
                className="inline-flex min-h-11 items-center text-sm font-medium text-teal-700 hover:text-teal-800"
              >
                返回普通登录
              </button>
            ) : null}
          </span>
          <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
            <KeyRound className="h-4 w-4 shrink-0 text-muted" />
            <Input
              id="login-license-key"
              value={licenseKey}
              onChange={(event) => setLicenseKey(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="h-auto border-0 bg-transparent p-0 uppercase shadow-none focus-visible:ring-0"
              placeholder="XT-USER-XXXX-XXXX-XXXX"
            />
          </span>
          <span className="mt-1.5 block text-xs leading-5 text-muted">
            首次开户填写网名和卡密；原账号换卡恢复时网名可留空，并保留聊天记录。
          </span>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p>{error}</p>
            {technicalError?.code || technicalError?.requestId ? (
              <details className="mt-2 text-xs text-rose-600">
                <summary className="cursor-pointer select-none font-medium">查看技术信息</summary>
                <div className="mt-1 space-y-1 break-all">
                  {technicalError.code ? <p>错误码：{technicalError.code}</p> : null}
                  {technicalError.requestId ? <p>请求 ID：{technicalError.requestId}</p> : null}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      ) : null}

      <Button type="submit" disabled={loading} aria-busy={loading} className="h-11 w-full">
        {loading ? "正在登录..." : "登录"}
        <ArrowRight className="h-4 w-4" />
      </Button>
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
              用手机号登录，进入你的AI沟通助手。上传客户对话、输入沟通问题，小董AI大脑🧠生成可执行回复方案。
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
