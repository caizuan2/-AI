import { AiBrainDashboardPage } from "@/apps/team-os/features/ai-brain/pages";

export const metadata = { title: "企业 AI 大脑 | AI Team OS" };

export default function AiBrainRoute({ searchParams }: {
  searchParams?: { companyId?: string | string[] };
}) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <AiBrainDashboardPage initialCompanyId={companyId} />;
}
