import { UsageCenterPage } from "@/apps/team-os/features/tenant/pages/UsageCenterPage";

export const metadata = { title: "使用量中心 | AI Team OS" };

export default function UsagePage({ searchParams }: { searchParams?: { companyId?: string | string[] } }) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <UsageCenterPage initialCompanyId={companyId} />;
}
