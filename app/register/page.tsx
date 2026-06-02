"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Database, LockKeyhole, Mail, Sparkles, TriangleAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapApiResponse } from "@/lib/api/client";
import { LOCAL_AUTH_DEFAULT_EMAIL, LOCAL_AUTH_DEFAULT_NAME, LOCAL_AUTH_DEFAULT_PASSWORD } from "@/lib/auth/local";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export default function RegisterPage() {
  const router = useRouter();
  const useSupabase = hasSupabaseConfig();
  const [name, setName] = useState(useSupabase ? "" : LOCAL_AUTH_DEFAULT_NAME);
  const [email, setEmail] = useState(useSupabase ? "" : LOCAL_AUTH_DEFAULT_EMAIL);
  const [password, setPassword] = useState(useSupabase ? "" : LOCAL_AUTH_DEFAULT_PASSWORD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim() || !email.trim() || !password) {
      setError("请输入姓名、邮箱和密码。");
      return;
    }

    if (password.length < 6) {
      setError("密码至少需要 6 位。");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (!useSupabase) {
        const response = await fetch("/api/auth/local-register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            password
          })
        });

        await unwrapApiResponse<unknown>(response, "本地注册失败，请稍后重试。");
        router.push("/knowledge");
        router.refresh();
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            name: name.trim()
          }
        }
      });

      if (signUpError) {
        setError(signUpError.message.includes("already") ? "该邮箱已注册，请直接登录。" : "注册失败，请稍后重试。");
        return;
      }

      if (data.session) {
        router.push("/knowledge");
        router.refresh();
        return;
      }

      setSuccess("注册成功，请检查邮箱完成验证。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "注册失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

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
            Secure workspace
          </div>
          <h1 className="text-5xl font-semibold leading-tight">
            创建账号后，知识投喂、检索和问答都会绑定到你的身份。
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            每个账号只访问自己的知识数据。
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
            <h2 className="mt-2 text-3xl font-semibold text-ink">注册工作台</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {useSupabase ? "使用邮箱密码创建 Supabase Auth 账号。" : "当前为本地开发注册，会创建本地开发会话。"}
            </p>
          </div>

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
                  autoComplete="new-password"
                  className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                  placeholder="至少 6 位"
                />
              </span>
            </label>

            {error ? (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <TriangleAlert className="h-4 w-4" />
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-sm text-teal-700">
                <CheckCircle2 className="h-4 w-4" />
                {success}
              </div>
            ) : null}

            <Button type="submit" disabled={loading} className="h-11 w-full">
              {loading ? "正在注册" : "注册"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

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
