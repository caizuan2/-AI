import { Suspense } from "react";
import { OnboardingShell } from "@/apps/team-os/features/onboarding/components/OnboardingShell";
import { TeamOsActivateForm } from "@/apps/team-os/features/onboarding/components/TeamOsActivateForm";

export function TeamOsActivatePage() {
  return (
    <OnboardingShell
      eyebrow="企业开通"
      title="激活 AI Team OS 企业"
      description="输入超级管理员签发的 XT-TEAM 企业授权码，系统将一次性创建企业、默认团队和负责人权限。"
    >
      <Suspense fallback={<div className="mt-8 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">正在加载企业激活信息...</div>}>
        <TeamOsActivateForm />
      </Suspense>
    </OnboardingShell>
  );
}
