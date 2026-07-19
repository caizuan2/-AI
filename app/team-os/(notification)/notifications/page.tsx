import { NotificationCenterPage } from "@/apps/team-os/features/notification/pages/NotificationCenterPage";

export const metadata = { title: "消息中心 | AI Team OS" };

export default function NotificationsPage({ searchParams }: { searchParams?: { companyId?: string | string[] } }) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <NotificationCenterPage initialCompanyId={companyId} />;
}
