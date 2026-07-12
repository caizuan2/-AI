import { IndustryStandardsPage } from "@/apps/team-os/features/industry-coach/pages/IndustryStandardsPage";

export const metadata = { title: "行业标准库 | AI Team OS" };

export default function IndustryStandardsRoute({ searchParams }: { searchParams?: { companyId?: string | string[] } }) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <IndustryStandardsPage initialCompanyId={companyId} />;
}
