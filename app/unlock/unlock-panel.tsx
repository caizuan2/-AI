"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Database, KeyRound, Loader2, LockKeyhole, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapApiResponse } from "@/lib/api/client";

export function UnlockPanel({ user }: { user: { phone: string; name: string } }) {
  const router = useRouter();
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!licenseKey.trim()) {
      setError("请输入卡密。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/license/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ licenseKey })
      });

      await unwrapApiResponse<unknown>(response, "卡密激活失败。");
      router.push("/");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "卡密激活失败，请稍后重试。");
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
            <p className="text-xs text-slate-300">License Activation</p>
          </div>
        </div>

        <div className="relative z-10 mt-auto max-w-2xl pb-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-teal-100 ring-1 ring-white/15">
            <KeyRound className="h-4 w-4" />
            License Required
          </div>
          <h1 className="text-5xl font-semibold leading-tight">
            激活后才能使用知识库功能。
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            卡密只保存 hash，数据库不会保存明文卡密。
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
            <p className="text-sm font-medium text-teal-700">{user.name} · {user.phone}</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">输入卡密激活 AI 知识库</h2>
            <p className="mt-2 text-sm leading-6 text-muted">激活成功后会自动进入首页。</p>
          </div>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink">卡密</span>
              <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
                <LockKeyhole className="h-4 w-4 text-muted" />
                <Input
                  value={licenseKey}
                  onChange={(event) => setLicenseKey(event.target.value)}
                  autoComplete="off"
                  className="h-auto border-0 bg-transparent p-0 uppercase shadow-none focus-visible:ring-0"
                  placeholder="AIKB-XXXX-XXXX-XXXX"
                />
              </span>
            </label>

            {error ? (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                {error}
              </div>
            ) : null}

            <Button type="submit" disabled={loading} className="h-11 w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              立即激活
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
