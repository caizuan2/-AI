"use client";

import * as React from "react";
import { KeyRound, LogOut, ShieldAlert } from "lucide-react";
import {
  checkCurrentUserLicense,
  createUserLicenseAwareFetch,
  createUserLicenseGuardStore,
  USER_LICENSE_CHECK_INTERVAL_MS,
  type UserLicenseInvalidReason
} from "../lib/user-license-guard";

function UserLicenseInvalidDialog({
  open,
  reason
}: {
  open: boolean;
  reason: UserLicenseInvalidReason | null;
}) {
  const dialogRef = React.useRef<HTMLDialogElement | null>(null);
  const primaryActionRef = React.useRef<HTMLButtonElement | null>(null);
  const [leaving, setLeaving] = React.useState<"activate" | "account" | null>(null);

  React.useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog || !open) {
      return;
    }

    if (!dialog.open) {
      dialog.showModal();
    }

    primaryActionRef.current?.focus();
  }, [open]);

  function goToActivation() {
    setLeaving("activate");
    window.location.assign(`/unlock?reactivate=1&reason=${reason ?? "expired"}`);
  }

  async function switchAccount() {
    setLeaving("account");

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store"
      });
    } catch {
      // The login page remains the safe destination when logout cannot be confirmed.
    } finally {
      window.location.assign("/login?app=user");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="user-license-invalid-title"
      aria-describedby="user-license-invalid-description"
      onCancel={(event) => event.preventDefault()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/60"
    >
      <div className="p-6 sm:p-7">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 id="user-license-invalid-title" className="mt-5 text-xl font-bold">
          {reason === "disabled" ? "卡密已被禁用" : "卡密已过期"}
        </h2>
        <p id="user-license-invalid-description" className="mt-3 text-sm leading-6 text-slate-600">
          用户端 AI 对话和知识库功能已暂停。请重新激活卡密或切换账号后继续使用。
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            ref={primaryActionRef}
            type="button"
            disabled={leaving !== null}
            onClick={goToActivation}
            className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {leaving === "activate" ? "正在前往..." : "重新激活"}
          </button>
          <button
            type="button"
            disabled={leaving !== null}
            onClick={() => void switchAccount()}
            className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {leaving === "account" ? "正在切换..." : "切换账号"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function useUserLicenseGuard() {
  const storeRef = React.useRef<ReturnType<typeof createUserLicenseGuardStore> | null>(null);

  if (!storeRef.current) {
    storeRef.current = createUserLicenseGuardStore();
  }

  const store = storeRef.current;
  const snapshot = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );

  React.useEffect(() => {
    const originalFetch = window.fetch;
    const guardedFetch = createUserLicenseAwareFetch(
      (input, init) => originalFetch(input, init),
      store
    );

    window.fetch = guardedFetch as typeof window.fetch;

    return () => {
      if (window.fetch === guardedFetch) {
        window.fetch = originalFetch;
      }
    };
  }, [store]);

  React.useEffect(() => {
    let active = true;
    let checkPromise: Promise<void> | null = null;

    function checkLicense() {
      if (!active || store.getSnapshot().invalid || checkPromise) {
        return;
      }

      checkPromise = checkCurrentUserLicense(
        (input, init) => window.fetch(input, init),
        store
      ).finally(() => {
        checkPromise = null;
      });
    }

    function checkWhenVisible() {
      if (document.visibilityState === "visible") {
        checkLicense();
      }
    }

    checkLicense();
    const intervalId = window.setInterval(checkLicense, USER_LICENSE_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", checkWhenVisible);
    window.addEventListener("focus", checkLicense);
    window.addEventListener("pageshow", checkLicense);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", checkWhenVisible);
      window.removeEventListener("focus", checkLicense);
      window.removeEventListener("pageshow", checkLicense);
    };
  }, [store]);

  return (
    <UserLicenseInvalidDialog
      open={snapshot.invalid}
      reason={snapshot.invalid ? snapshot.reason : null}
    />
  );
}
