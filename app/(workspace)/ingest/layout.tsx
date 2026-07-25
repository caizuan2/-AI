import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { LicenseReactivationSync } from "@/components/auth/license-reactivation-sync";
import { requireIngestAdminAccess } from "@/lib/auth/guards";
import { getLicenseReactivationUrl, type LicenseReactivationReason } from "@/lib/auth/license-reactivation";
import {
  LicenseAppTypeMismatchError,
  LicenseDisabledError,
  LicenseExpiredError,
  LicenseRequiredError,
  UnauthorizedError
} from "@/lib/errors";

export const dynamic = "force-dynamic";

function getReactivationReason(error: unknown): LicenseReactivationReason | null {
  if (error instanceof LicenseDisabledError) {
    return "disabled";
  }

  if (error instanceof LicenseExpiredError) {
    return "expired";
  }

  if (error instanceof LicenseRequiredError) {
    return "missing";
  }

  if (error instanceof LicenseAppTypeMismatchError) {
    return "mismatch";
  }

  return null;
}

export default async function IngestLicenseLayout({ children }: { children: ReactNode }) {
  try {
    const user = await requireIngestAdminAccess();

    return (
      <>
        <LicenseReactivationSync userId={user.id} appType="ingest_admin" />
        {children}
      </>
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?app=admin&next=/ingest&reactivate=1");
    }

    const reason = getReactivationReason(error);

    if (reason) {
      redirect(getLicenseReactivationUrl("ingest_admin", "/ingest", reason));
    }

    redirect("/no-access");
  }
}
