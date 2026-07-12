import { SubscriptionCenterPage } from "@/apps/team-os/features/tenant/pages/SubscriptionCenterPage";

export const metadata = { title: "套餐中心 | AI Team OS" };

export default function SubscriptionPage({ searchParams }: { searchParams?: { companyId?: string | string[] } }) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <SubscriptionCenterPage initialCompanyId={companyId} />;
}
