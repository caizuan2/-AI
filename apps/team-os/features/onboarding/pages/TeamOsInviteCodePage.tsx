import { OnboardingShell } from "@/apps/team-os/features/onboarding/components/OnboardingShell";
import { TeamOsInviteCodeForm } from "@/apps/team-os/features/onboarding/components/TeamOsInviteCodeForm";

export function TeamOsInviteCodePage() {
  return (
    <OnboardingShell
      eyebrow="企业成员入口"
      title="输入企业邀请码"
      description="主管、培训师和员工无需购买卡密。输入企业负责人发送的邀请码，核验后即可登录或注册加入团队。"
    >
      <TeamOsInviteCodeForm />
    </OnboardingShell>
  );
}
