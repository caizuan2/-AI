import { AiCoachReportPage } from "@/apps/team-os/features/ai-coach/pages/AiCoachReportPage";

export const metadata = { title: "成长报告 | AI Team OS" };

export default function AiCoachReportRoute({ params }: { params: { id: string } }) {
  return <AiCoachReportPage reportId={params.id} />;
}
