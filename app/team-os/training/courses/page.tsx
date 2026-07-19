import { TrainingCoursesPage } from "@/apps/team-os/features/training/pages/TrainingCoursesPage";

export const metadata = { title: "课程中心 | AI Team OS" };

export default function TrainingCoursesRoute({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const courseId = typeof searchParams?.courseId === "string" && searchParams.courseId.length <= 160
    ? searchParams.courseId
    : undefined;
  return <TrainingCoursesPage initialCourseId={courseId} />;
}
