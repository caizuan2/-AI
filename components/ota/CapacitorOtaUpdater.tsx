"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __aiKnowledgeOtaStarted?: boolean;
  }
}

const shouldTriggerOtaCheck = process.env.NEXT_PUBLIC_OTA_ENABLED !== "false";
const isDevelopment = process.env.NODE_ENV !== "production";

function warnInDevelopment(message: string, error?: unknown) {
  if (!isDevelopment) {
    return;
  }

  if (error) {
    console.warn(message, error);
  } else {
    console.warn(message);
  }
}

export function CapacitorOtaUpdater() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.__aiKnowledgeOtaStarted) {
      return;
    }
    window.__aiKnowledgeOtaStarted = true;

    let cancelled = false;

    async function runOtaCheck() {
      try {
        const { Capacitor } = await import("@capacitor/core");

        if (cancelled || !Capacitor.isNativePlatform()) {
          return;
        }

        const { CapacitorUpdater } = await import("@capgo/capacitor-updater");

        await CapacitorUpdater.notifyAppReady();

        if (!shouldTriggerOtaCheck) {
          warnInDevelopment("Capgo OTA check skipped because NEXT_PUBLIC_OTA_ENABLED=false.");
          return;
        }

        const result = await CapacitorUpdater.triggerUpdateCheck();
        if (result.status !== "queued") {
          warnInDevelopment(`Capgo OTA check was not queued: ${result.status}.`);
        }
      } catch (error) {
        warnInDevelopment("Capgo OTA check failed and was skipped.", error);
      }
    }

    void runOtaCheck();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
