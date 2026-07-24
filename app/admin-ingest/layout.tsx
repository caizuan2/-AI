import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { IngestLicenseInvalidGate } from "@/components/enterprise-admin/IngestLicenseInvalidGate";
import { requireUser } from "@/lib/auth";
import { resolveIngestAccessTier } from "@/lib/enterprise/ingest-access-tier";
import {
  UnauthorizedError
} from "@/lib/errors";
import type { IngestLicenseInvalidCode } from "@/lib/enterprise/ingest-license-invalid";
import type { IngestAccessTier } from "@/lib/enterprise/ingest-access-policy";

export const dynamic = "force-dynamic";

export default async function AdminIngestLayout({ children }: { children: ReactNode }) {
  let initialLicenseCode: IngestLicenseInvalidCode | null = null;
  let initialAccessTier: IngestAccessTier = "none";
  let shouldActivate = false;

  try {
    const user = await requireUser();
    const access = await resolveIngestAccessTier(user);
    initialAccessTier = access.accessTier;

    if (access.accessTier === "none") {
      if (access.invalidLicenseCode) {
        initialLicenseCode = access.invalidLicenseCode;
      } else {
        shouldActivate = true;
      }
    }
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/ingest/login?next=/admin-ingest");
    }

    redirect("/no-access");
  }

  if (shouldActivate) {
    redirect("/ingest/activate?next=/admin-ingest");
  }

  return (
    <IngestLicenseInvalidGate
      initialCode={initialLicenseCode}
      initialAccessTier={initialAccessTier}
    >
      <div className="flex h-screen w-full overflow-hidden bg-[#f7f7f6] text-[#191919] antialiased">
        {children}
      </div>
    </IngestLicenseInvalidGate>
  );
}
