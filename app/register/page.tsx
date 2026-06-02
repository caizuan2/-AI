"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Database, LockKeyhole, Phone, Sparkles, TriangleAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapApiResponse } from "@/lib/api/client";

interface RegisterResponse {
  user: {
    licenseActivated: boolean;
  };
}

function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim() || !phone.trim() || !password || !confirmPassword) {
      setError("请输入姓名、手机号、密码和确认密码。");
      return;
    }

    if (password.length < 8) {
      setError("密码至少需要 8 位。");
      return;
    }

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          phone,
          password
        })
      });
      const data = await unwrapApiResponse<RegisterResponse>(response, "注册失败，请稍后重试。");

      router.push(data.user.licenseActivated ? "/" : "/unlock");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "注册失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-ink">姓名</span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
          <UserRound className="h-4 w-4 text-muted" />
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            placeholder="你的姓名"
          />
        </span>
      </label>

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
            autoComplete="new-password"
            className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            placeholder="至少 8 位"
          />
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink">确认密码</span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
          <LockKeyhole className="h-4 w-4 text-muted" />
          <Input
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            type="password"
            autoComplete="new-password"
            className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            placeholder="再次输入密码"
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
        {loading ? "正在注册" : "注册并登录"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}

export default function RegisterPage() {
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
            Phone Password
          </div>
          <h1 className="text-5xl font-semibold leading-tight">
            注册后输入卡密，开启知识库工作台。
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            密码会哈希保存，卡密也只保存 hash，不保存明文。
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
            <p className="text-sm font-medium text-teal-700">创建账号</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">手机号注册</h2>
            <p className="mt-2 text-sm leading-6 text-muted">使用手机号和密码创建账号。</p>
          </div>

          <RegisterForm />

          <p className="mt-5 text-center text-sm text-muted">
            已有账号？
            <Link href="/login" className="font-medium text-teal-700 hover:text-teal-800">
              去登录
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
