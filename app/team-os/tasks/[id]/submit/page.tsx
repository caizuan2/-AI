import { TaskSubmissionPage } from "@/apps/team-os/features/tasks/pages/TaskSubmissionPage";

export const metadata = {
  title: "任务提交 | AI Team OS"
};

export default function TeamOsTaskSubmissionRoute({ params }: { params: { id: string } }) {
  return <TaskSubmissionPage taskId={params.id} />;
}
