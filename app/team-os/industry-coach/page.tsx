import { IndustryCoachDashboardPage } from "@/apps/team-os/features/industry-coach/pages/IndustryCoachDashboardPage";

export const metadata = { title: "行业教练 | AI Team OS" };

export default function IndustryCoachPage({ searchParams }: { searchParams?: { companyId?: string | string[] } }) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <IndustryCoachDashboardPage initialCompanyId={companyId} />;
}
