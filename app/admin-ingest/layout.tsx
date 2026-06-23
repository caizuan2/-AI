import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireIngestAdminAccess } from "@/lib/auth/guards";
import { LicenseAppTypeMismatchError, LicenseRequiredError, UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function AdminIngestLayout({ children }: { children: ReactNode }) {
  try {
    await requireIngestAdminAccess();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/ingest/login?next=/admin-ingest");
    }

    if (error instanceof LicenseRequiredError || error instanceof LicenseAppTypeMismatchError) {
      redirect("/ingest/activate?next=/admin-ingest");
    }

    redirect("/no-access");
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f7f7f6] text-[#191919] antialiased">
      {children}
    </div>
  );
}
