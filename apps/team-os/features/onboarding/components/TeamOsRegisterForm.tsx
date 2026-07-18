"use client";

import { FormEvent, type ReactNode, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, AtSign, LockKeyhole, Phone, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapApiResponse } from "@/lib/api/client";
import { isTeamOsInvitationCode } from "@/apps/team-os/features/onboarding/utils/onboarding-input";
import type { TeamOsRegisterResult } from "@/apps/team-os/features/onboarding/types";
import { FormMessage } from "@/apps/team-os/features/onboarding/components/FormMessage";

export function TeamOsRegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationCode = searchParams.get("invite");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/team-os/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, password })
      });
      const data = await unwrapApiResponse<TeamOsRegisterResult>(response, "注册失败，请稍后重试。");
      const nextPath = isTeamOsInvitationCode(invitationCode)
        ? `/team-os/invite/${encodeURIComponent(invitationCode)}`
        : data.nextPath;
      router.replace(nextPath);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "网络错误，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <Field icon={UserRound} label="姓名">
        <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" autoFocus className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" placeholder="请输入姓名" />
      </Field>
      <Field icon={Phone} label="手机号">
        <Input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" inputMode="tel" autoComplete="tel" className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" placeholder="请输入手机号" />
      </Field>
      <Field icon={AtSign} label="邮箱">
        <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" placeholder="用于接收并核验企业邀请" />
      </Field>
      <Field icon={LockKeyhole} label="密码">
        <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" placeholder="至少 8 位" />
      </Field>
      {error ? <FormMessage message={error} /> : null}
      <Button type="submit" disabled={loading} className="h-11 w-full bg-indigo-600 text-white hover:bg-indigo-700">
        {loading ? "正在创建账号" : invitationCode ? "注册并接受邀请" : "注册并开通企业"}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      <div className="space-y-2 text-center text-sm text-slate-500">
        <p>已有账号？ <Link href={invitationCode ? `/team-os/login?next=${encodeURIComponent(`/team-os/invite/${invitationCode}`)}` : "/team-os/login?next=%2Fteam-os%2Factivate"} className="font-medium text-indigo-700 hover:text-indigo-800">登录 AI Team OS</Link></p>
        <p>企业成员无需购买卡密，请使用负责人发出的邀请链接。</p>
      </div>
    </form>
  );
}

function Field({ icon: Icon, label, children }: { icon: typeof UserRound; label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
        <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />
        {children}
      </span>
    </label>
  );
}
