import { NotificationLoadingState } from "@/apps/team-os/features/notification/components/NotificationState";

export default function NotificationRoutesLoading() {
  return (
    <div className="mx-auto max-w-7xl">
      <NotificationLoadingState label="正在加载企业消息中心…" />
    </div>
  );
}
