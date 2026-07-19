"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, CalendarClock, LoaderCircle, Mail, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiClientError, unwrapApiResponse } from "@/lib/api/client";
import type {
  AcceptTeamOsInvitationResult,
  TeamOsInvitationDetails,
  TeamOsInvitationRole
} from "@/apps/team-os/features/onboarding/types";
import { FormMessage } from "@/apps/team-os/features/onboarding/components/FormMessage";

const roleLabels: Record<TeamOsInvitationRole, string> = {
  TEAM_MANAGER: "团队主管",
  TRAINER: "培训师",
  TEAM_MEMBER: "团队成员"
};

export function TeamOsInvitationCard({ code }: { code: string }) {
  const router = useRouter();
  const [details, setDetails] = useState<TeamOsInvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [accepted, setAccepted] = useState<AcceptTeamOsInvitationResult | null>(null);

  useEffect(() => {
    let active = true;
    async function loadInvitation() {
      try {
        const response = await fetch(`/api/team-os/auth/invitations/${encodeURIComponent(code)}`, { cache: "no-store" });
        const data = await unwrapApiResponse<TeamOsInvitationDetails>(response, "读取邀请失败，请稍后重试。");
        if (active) setDetails(data);
      } catch (caughtError) {
        if (active) setError(caughtError instanceof Error ? caughtError.message : "读取邀请失败，请稍后重试。");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadInvitation();
    return () => { active = false; };
  }, [code]);

  async function acceptInvitation() {
    setAccepting(true);
    setError("");
    setNeedsLogin(false);
    try {
      const response = await fetch(`/api/team-os/auth/invitations/${encodeURIComponent(code)}`, { method: "POST" });
      const data = await unwrapApiResponse<AcceptTeamOsInvitationResult>(response, "接受邀请失败，请稍后重试。");
      setAccepted(data);
    } catch (caughtError) {
      if (caughtError instanceof ApiClientError && caughtError.details.code === "UNAUTHORIZED") {
        setNeedsLogin(true);
      }
      setError(caughtError instanceof Error ? caughtError.message : "接受邀请失败，请稍后重试。");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return <div className="mt-8 flex items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-8 text-sm text-indigo-700"><LoaderCircle className="h-4 w-4 animate-spin" />正在核验企业邀请...</div>;
  }
  if (accepted) {
    return (
      <div className="mt-8 space-y-5">
        <FormMessage tone="success" message={`已加入 ${accepted.companyName} · ${accepted.teamName}${accepted.emailBound ? "，邀请邮箱已安全绑定到当前账号。" : "。"}`} />
        <Button type="button" onClick={() => { router.replace(accepted.nextPath); router.refresh(); }} className="h-11 w-full bg-indigo-600 text-white hover:bg-indigo-700">
          完成团队初始化 <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }
  if (error && !details) {
    return <div className="mt-8 space-y-4"><FormMessage message={error} /><Link href="/team-os/login" className="block text-center text-sm font-medium text-indigo-700">返回 AI Team OS 登录</Link></div>;
  }
  if (!details) {
    return <div className="mt-8 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">没有可显示的邀请信息。</div>;
  }

  return (
    <div className="mt-8 space-y-5">
      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/60 px-4">
        <InvitationRow icon={Building2} label="企业与团队" value={`${details.companyName} · ${details.teamName}`} />
        <InvitationRow icon={UserRoundCheck} label="受邀角色" value={roleLabels[details.role]} />
        <InvitationRow icon={Mail} label="邀请邮箱" value={details.emailMasked} />
        <InvitationRow icon={CalendarClock} label="有效期至" value={new Date(details.expiresAt).toLocaleString("zh-CN", { hour12: false })} />
      </dl>
      {!details.canAccept ? <FormMessage message={details.status === "ACCEPTED" ? "该邀请已经被接受。" : details.status === "EXPIRED" ? "该邀请已经过期，请联系企业负责人重新邀请。" : "该企业或团队当前不可加入。"} /> : null}
      {error ? <FormMessage message={error} /> : null}
      {needsLogin ? (
        <div className="grid grid-cols-2 gap-3">
          <Link href={`/team-os/login?next=${encodeURIComponent(`/team-os/invite/${code}`)}`} className="focus-ring inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">已有账号登录</Link>
          <Link href={`/team-os/register?invite=${encodeURIComponent(code)}`} className="focus-ring inline-flex h-11 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700">注册新账号</Link>
        </div>
      ) : (
        <Button type="button" onClick={acceptInvitation} disabled={!details.canAccept || accepting} className="h-11 w-full bg-indigo-600 text-white hover:bg-indigo-700">
          {accepting ? "正在加入企业" : "接受邀请并加入团队"}<ArrowRight className="h-4 w-4" />
        </Button>
      )}
      <p className="text-center text-xs leading-5 text-slate-500">接受后将使用邀请角色进入该企业。企业成员无需输入 XT-TEAM 授权码。</p>
    </div>
  );
}

function InvitationRow({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
      <dt className="w-20 shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-800">{value}</dd>
    </div>
  );
}
