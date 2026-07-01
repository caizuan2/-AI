import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getEntryRoleFromAccessProfile,
  getUserAccessProfile,
  hasUserClientAccess
} from "@/lib/auth/access-control";
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

  const profile = await getUserAccessProfile(user);

  if (hasUserClientAccess(profile)) {
    redirect("/app");
  }

  if (getEntryRoleFromAccessProfile(profile) === "user") {
    redirect("/unlock");
  }

  redirect("/login");
}
