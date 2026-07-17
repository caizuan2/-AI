import { redirect } from "next/navigation";
import { UnlockPanel } from "@/app/unlock/unlock-panel";
import { requireUser } from "@/lib/auth";
import { getEntryPathFromAccessProfile, getUserAccessProfile } from "@/lib/auth/access-control";
import { UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

type UnlockPageProps = {
  searchParams?: {
    reactivate?: string;
    reason?: string;
  };
};

type UserLicenseReactivationReason = "disabled" | "expired";

function readReactivationReason(value: string | undefined): UserLicenseReactivationReason | null {
  return value === "disabled" || value === "expired" ? value : null;
}

export default async function UnlockPage({ searchParams }: UnlockPageProps) {
  const reactivationReason = readReactivationReason(searchParams?.reason);
  const reactivationRequested = searchParams?.reactivate === "1" && reactivationReason !== null;

  try {
    const user = await requireUser();
    const profile = await getUserAccessProfile(user);
    const entryPath = getEntryPathFromAccessProfile(profile);

    if (!reactivationRequested && entryPath !== "/unlock") {
      redirect(entryPath);
    }

    return (
      <UnlockPanel
        user={{ phone: user.phone, name: user.name }}
        reactivationReason={reactivationReason}
      />
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      const nextPath = reactivationRequested
        ? `/unlock?reactivate=1&reason=${reactivationReason}`
        : "/unlock";
      redirect(`/login?next=${encodeURIComponent(nextPath)}&activation=1`);
    }

    throw error;
  }
}
