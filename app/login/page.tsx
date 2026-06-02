"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Database, LockKeyhole, Mail, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setError("请输入邮箱和密码。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (signInError) {
        setError("邮箱或密码不正确。");
        return;
      }

      router.push("/");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "登录失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-ink">邮箱</span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
          <Mail className="h-4 w-4 text-muted" />
          <Input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            placeholder="you@example.com"
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
            placeholder="输入密码"
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
        还没有账号？
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
            Supabase Auth
          </div>
          <h1 className="text-5xl font-semibold leading-tight">
            把对话、工单和文档沉淀成可追溯的个人知识库。
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
            <h2 className="mt-2 text-3xl font-semibold text-ink">登录工作台</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              使用 Supabase Auth 账号继续。
            </p>
          </div>

          <LoginForm />
        </div>
      </section>
    </main>
  );
}
