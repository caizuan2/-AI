import { redirect } from "next/navigation";
import { UnlockPanel } from "@/app/unlock/unlock-panel";
import { requireUser } from "@/lib/auth";
import { checkUserLicense } from "@/lib/auth/license";
import {
  getHistoryScopeForUser,
  getLicenseReactivationTarget,
  maskAccountPhone,
  normalizeLicenseReactivationAppType,
  normalizeLicenseReactivationReason,
  type LicenseReactivationReason
} from "@/lib/auth/license-reactivation";
import {
  ForbiddenError,
  LicenseAppTypeMismatchError,
  LicenseDisabledError,
  LicenseExpiredError,
  LicenseRequiredError,
  UnauthorizedError
} from "@/lib/errors";

export const dynamic = "force-dynamic";

function getReasonFromError(error: unknown): LicenseReactivationReason | null {
  if (error instanceof LicenseDisabledError) {
    return "disabled";
  }

  if (error instanceof LicenseExpiredError) {
    return "expired";
  }

  if (error instanceof LicenseAppTypeMismatchError) {
    return "mismatch";
  }

  if (error instanceof LicenseRequiredError) {
    return "missing";
  }

  return null;
}

export default async function UnlockPage({
  searchParams
}: {
  searchParams?: { app?: string; next?: string; reason?: string };
}) {
  try {
    const user = await requireUser();
    const appType = normalizeLicenseReactivationAppType(searchParams?.app);
    const nextPath = getLicenseReactivationTarget(appType, searchParams?.next);
    let reason = normalizeLicenseReactivationReason(searchParams?.reason);
    let hasValidLicense = false;

    try {
      await checkUserLicense(user.id, appType);
      hasValidLicense = true;
    } catch (error) {
      const actualReason = getReasonFromError(error);

      if (!actualReason) {
        throw error;
      }

      reason = actualReason;
    }

    if (hasValidLicense) {
      redirect(nextPath);
    }

    return (
      <UnlockPanel
        user={{
          id: user.id,
          maskedPhone: maskAccountPhone(user.phone),
          name: user.name,
          historyScope: getHistoryScopeForUser(user.id)
        }}
        appType={appType}
        nextPath={nextPath}
        reason={reason}
      />
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      const appType = normalizeLicenseReactivationAppType(searchParams?.app);
      const nextPath = getLicenseReactivationTarget(appType, searchParams?.next);
      const loginTarget = `/unlock?app=${encodeURIComponent(appType)}&next=${encodeURIComponent(nextPath)}`;

      redirect(`/login?next=${encodeURIComponent(loginTarget)}&reactivate=1`);
    }

    if (error instanceof ForbiddenError) {
      redirect("/no-access?reason=account_disabled");
    }

    throw error;
  }
}
