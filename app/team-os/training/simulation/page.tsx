import { TrainingSimulationPage } from "@/apps/team-os/features/training/pages/TrainingSimulationPage";

export const metadata = { title: "AI 模拟训练 | AI Team OS" };

export default function TrainingSimulationRoute({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const courseId = typeof searchParams?.courseId === "string" && searchParams.courseId.length <= 160
    ? searchParams.courseId
    : undefined;
  return <TrainingSimulationPage initialCourseId={courseId} />;
}
