import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEntryPathFromAccessProfile, getUserAccessProfile } from "@/lib/auth/access-control";
import { UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let user: Awaited<ReturnType<typeof getCurrentUser>>;

  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login");
    }

    throw error;
  }

  redirect(getEntryPathFromAccessProfile(await getUserAccessProfile(user)));
}
