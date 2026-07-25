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
import { createAdminIngestHistoryScope } from "@/lib/enterprise/admin-ingest-history-scope";

export const dynamic = "force-dynamic";

export default async function AdminIngestLayout({ children }: { children: ReactNode }) {
  let initialLicenseCode: IngestLicenseInvalidCode | null = null;
  let initialAccessTier: IngestAccessTier = "none";
  let initialHistoryScope = "";
  let shouldActivate = false;

  try {
    const user = await requireUser();
    const access = await resolveIngestAccessTier(user);
    initialAccessTier = access.accessTier;
    initialHistoryScope = access.capabilities.enterPortal
      ? createAdminIngestHistoryScope(user.id)
      : "";

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
      initialHistoryScope={initialHistoryScope}
    >
      <div className="flex h-screen w-full overflow-hidden bg-[#f7f7f6] text-[#191919] antialiased">
        {children}
      </div>
    </IngestLicenseInvalidGate>
  );
}
