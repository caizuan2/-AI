import { OnboardingShell } from "@/apps/team-os/features/onboarding/components/OnboardingShell";
import { TeamOsInvitationCard } from "@/apps/team-os/features/onboarding/components/TeamOsInvitationCard";

export function TeamOsInvitePage({ code }: { code: string }) {
  return (
    <OnboardingShell
      eyebrow="企业成员邀请"
      title="加入 AI Team OS 团队"
      description="核对企业、团队和角色后登录或注册。邀请只可使用一次，且必须由受邀邮箱对应的账号接受。"
    >
      <TeamOsInvitationCard code={code} />
    </OnboardingShell>
  );
}
