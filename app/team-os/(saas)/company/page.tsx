import { CompanyCenterPage } from "@/apps/team-os/features/tenant/pages/CompanyCenterPage";

export const metadata = { title: "企业中心 | AI Team OS" };

export default function CompanyPage({ searchParams }: { searchParams?: { companyId?: string | string[] } }) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <CompanyCenterPage initialCompanyId={companyId} />;
}
