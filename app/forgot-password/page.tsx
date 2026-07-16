"use client";

import { FormEvent, Suspense, useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, KeyRound, LockKeyhole, Phone, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapApiResponse } from "@/lib/api/client";
import { getProductFromPath } from "@/lib/auth/product";

interface ResetPasswordResponse {
  reset: true;
}

function PasswordResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getSafeNextPath = useCallback(() => {
    const candidate = searchParams.get("next") || "";

    if (!candidate.startsWith("/") || candidate.startsWith("//")) {
      return "";
    }

    const pathname = candidate.split("?")[0] || candidate;

    return getProductFromPath(pathname) === "user_app" ? candidate : "";
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!phone.trim() || !licenseKey.trim() || !newPassword || !confirmPassword) {
      setError("请输入手机号、原激活卡密、新密码和确认密码。");
      return;
    }

    if (newPassword.length < 8) {
      setError("新密码至少需要 8 位。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phone,
          licenseKey,
          newPassword,
          confirmPassword
        })
      });

      await unwrapApiResponse<ResetPasswordResponse>(response, "密码重置失败，请稍后重试。");

      const nextPath = getSafeNextPath();
      const loginParams = new URLSearchParams({ reset: "1" });

      if (nextPath) {
        loginParams.set("next", nextPath);
      }

      router.replace(`/login?${loginParams.toString()}`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "密码重置失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  const nextPath = getSafeNextPath();
  const loginHref = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-ink">注册手机号</span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
          <Phone className="h-4 w-4 shrink-0 text-muted" />
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            placeholder="请输入注册手机号"
          />
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink">原激活卡密</span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
          <KeyRound className="h-4 w-4 shrink-0 text-muted" />
          <Input
            value={licenseKey}
            onChange={(event) => setLicenseKey(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="h-auto border-0 bg-transparent p-0 uppercase shadow-none focus-visible:ring-0"
            placeholder="XT-USER-XXXX-XXXX-XXXX"
          />
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink">新密码</span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
          <LockKeyhole className="h-4 w-4 shrink-0 text-muted" />
          <Input
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            type="password"
            autoComplete="new-password"
            className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            placeholder="至少 8 位"
          />
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink">确认新密码</span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
          <LockKeyhole className="h-4 w-4 shrink-0 text-muted" />
          <Input
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            type="password"
            autoComplete="new-password"
            className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            placeholder="再次输入新密码"
          />
        </span>
      </label>

      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      ) : null}

      <Button type="submit" disabled={loading} className="h-11 w-full">
        {loading ? "正在重置" : "验证并重置密码"}
        <ArrowRight className="h-4 w-4" />
      </Button>

      <Link
        href={loginHref}
        className="flex min-h-11 items-center justify-center gap-2 rounded-md text-sm font-medium text-teal-700 hover:text-teal-800"
      >
        <ArrowLeft className="h-4 w-4" />
        返回登录
      </Link>

      <p className="rounded-lg bg-slate-50 px-3 py-2 text-center text-xs leading-5 text-muted">
        没有保存原卡密或账号尚未激活？请联系指导老师协助处理。
      </p>
    </form>
  );
}

export default function ForgotPasswordPage() {
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
            <p className="text-xs text-slate-300">安全找回用户端账号</p>
          </div>
        </div>

        <div className="relative z-10 mt-auto max-w-2xl pb-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-teal-100 ring-1 ring-white/15">
            <ShieldCheck className="h-4 w-4" />
            用户端密码找回
          </div>
          <h1 className="text-5xl font-semibold leading-tight">安全重置登录密码</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            使用注册手机号和原激活卡密验证账号归属，验证通过后即可设置新密码。
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
            <p className="text-sm font-medium text-teal-700">忘记密码</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">找回用户端账号</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              输入注册手机号和该账号原先激活使用的用户端卡密，然后设置新密码。
            </p>
          </div>

          <Suspense fallback={<div className="mt-8 text-sm text-muted">正在加载找回密码表单...</div>}>
            <PasswordResetForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
