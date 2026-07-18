import { Suspense } from "react";
import { OnboardingShell } from "@/apps/team-os/features/onboarding/components/OnboardingShell";
import { TeamOsRegisterForm } from "@/apps/team-os/features/onboarding/components/TeamOsRegisterForm";

export function TeamOsRegisterPage() {
  return (
    <OnboardingShell
      eyebrow="企业账号注册"
      title="注册 AI Team OS"
      description="企业负责人注册后使用 XT-TEAM 授权码开通企业；受邀成员注册后会返回邀请确认页。"
    >
      <Suspense fallback={<div className="mt-8 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">正在加载注册表单...</div>}>
        <TeamOsRegisterForm />
      </Suspense>
    </OnboardingShell>
  );
}
