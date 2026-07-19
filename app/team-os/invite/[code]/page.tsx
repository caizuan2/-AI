import { TeamOsInvitePage } from "@/apps/team-os/features/onboarding/pages/TeamOsInvitePage";

export const metadata = { title: "接受企业邀请 | AI Team OS" };

export default function TeamOsInviteRoute({ params }: { params: { code: string } }) {
  return <TeamOsInvitePage code={params.code} />;
}
