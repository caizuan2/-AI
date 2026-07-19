import {
  handleTrainingCoursesGet,
  handleTrainingCourseUpsert
} from "@/apps/team-os/features/training/services/training-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleTrainingCoursesGet(request);
}

export function POST(request: Request) {
  return handleTrainingCourseUpsert(request);
}
