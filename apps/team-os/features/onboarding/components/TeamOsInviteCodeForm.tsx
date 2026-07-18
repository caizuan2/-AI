"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, TicketCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/apps/team-os/features/onboarding/components/FormMessage";
import { isTeamOsInvitationCode } from "@/apps/team-os/features/onboarding/utils/onboarding-input";

export function TeamOsInviteCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = code.trim();
    if (!isTeamOsInvitationCode(normalized)) {
      setError("请输入负责人发送给你的完整邀请码。");
      return;
    }
    setLoading(true);
    setError("");
    router.push(`/team-os/invite/${encodeURIComponent(normalized)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-800">企业邀请码</span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
          <TicketCheck className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <Input value={code} onChange={(event) => setCode(event.target.value.trim())} autoComplete="off" autoFocus spellCheck={false} className="h-auto border-0 bg-transparent p-0 font-mono tracking-wide shadow-none focus-visible:ring-0" placeholder="粘贴企业负责人发送的邀请码" />
        </span>
      </label>
      {error ? <FormMessage message={error} /> : null}
      <Button type="submit" disabled={loading} className="h-11 w-full bg-indigo-600 text-white hover:bg-indigo-700">
        {loading ? "正在打开邀请" : "核验邀请"}<ArrowRight className="h-4 w-4" />
      </Button>
      <div className="space-y-2 text-center text-sm text-slate-500">
        <p>收到的是完整邀请链接？直接在浏览器中打开即可。</p>
        <p>企业负责人需要开通企业？ <Link href="/team-os/activate" className="font-medium text-indigo-700 hover:text-indigo-800">输入 XT-TEAM 授权码</Link></p>
      </div>
    </form>
  );
}
