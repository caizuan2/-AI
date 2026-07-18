import { redirect } from "next/navigation";
import { UnlockPanel } from "@/app/unlock/unlock-panel";
import { requireUser } from "@/lib/auth";
import { getEntryPathFromAccessProfile, getUserAccessProfile } from "@/lib/auth/access-control";
import { UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function UnlockPage() {
  try {
    const user = await requireUser();
    const profile = await getUserAccessProfile(user);
    const entryPath = getEntryPathFromAccessProfile(profile);

    if (entryPath !== "/unlock") {
      redirect(entryPath);
    }

    return <UnlockPanel user={{ phone: user.phone, name: user.name }} />;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?next=/unlock");
    }

    throw error;
  }
}
