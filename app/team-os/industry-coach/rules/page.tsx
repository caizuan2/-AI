import { IndustryRulesPage } from "@/apps/team-os/features/industry-coach/pages/IndustryRulesPage";

export const metadata = { title: "评分规则库 | AI Team OS" };

export default function IndustryRulesRoute({ searchParams }: { searchParams?: { companyId?: string | string[] } }) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <IndustryRulesPage initialCompanyId={companyId} />;
}
