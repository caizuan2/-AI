"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LICENSE_REACTIVATION_EVENT_KEY,
  type LicenseReactivationAppType
} from "@/lib/auth/license-reactivation";

export function LicenseReactivationSync({
  userId,
  appType
}: {
  userId: string;
  appType: LicenseReactivationAppType;
}) {
  const router = useRouter();

  useEffect(() => {
    function handleLicenseReactivated(event: StorageEvent) {
      if (event.key !== LICENSE_REACTIVATION_EVENT_KEY || !event.newValue) {
        return;
      }

      try {
        const payload = JSON.parse(event.newValue) as {
          userId?: string;
          permission?: LicenseReactivationAppType;
        };

        if (payload.userId === userId && payload.permission === appType) {
          router.refresh();
        }
      } catch {
        // Ignore malformed local events; refreshed server guards perform the real permission check.
      }
    }

    window.addEventListener("storage", handleLicenseReactivated);

    return () => {
      window.removeEventListener("storage", handleLicenseReactivated);
    };
  }, [appType, router, userId]);

  return null;
}
