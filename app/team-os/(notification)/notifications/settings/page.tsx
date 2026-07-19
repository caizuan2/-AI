import { NotificationSettingsPage } from "@/apps/team-os/features/notification/pages/NotificationSettingsPage";

export const metadata = { title: "通知设置 | AI Team OS" };

export default function NotificationSettingsRoute({ searchParams }: { searchParams?: { companyId?: string | string[] } }) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <NotificationSettingsPage initialCompanyId={companyId} />;
}
