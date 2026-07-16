import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { IngestLicenseInvalidGate } from "@/components/enterprise-admin/IngestLicenseInvalidGate";
import { requireIngestAdminAccess } from "@/lib/auth/guards";
import {
  LicenseAppTypeMismatchError,
  LicenseDisabledError,
  LicenseExpiredError,
  LicenseRequiredError,
  UnauthorizedError
} from "@/lib/errors";
import type { IngestLicenseInvalidCode } from "@/lib/enterprise/ingest-license-invalid";

export const dynamic = "force-dynamic";

export default async function AdminIngestLayout({ children }: { children: ReactNode }) {
  let initialLicenseCode: IngestLicenseInvalidCode | null = null;

  try {
    await requireIngestAdminAccess();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/ingest/login?next=/admin-ingest");
    }

    if (error instanceof LicenseRequiredError || error instanceof LicenseAppTypeMismatchError) {
      redirect("/ingest/activate?next=/admin-ingest");
    }

    if (error instanceof LicenseDisabledError) {
      initialLicenseCode = "LICENSE_DISABLED";
    } else if (error instanceof LicenseExpiredError) {
      initialLicenseCode = "LICENSE_EXPIRED";
    } else {
      redirect("/no-access");
    }
  }

  return (
    <IngestLicenseInvalidGate initialCode={initialLicenseCode}>
      <div className="flex h-screen w-full overflow-hidden bg-[#f7f7f6] text-[#191919] antialiased">
        {children}
      </div>
    </IngestLicenseInvalidGate>
  );
}
