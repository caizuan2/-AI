"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, ShieldAlert } from "lucide-react";
import {
  createIngestLicenseGuardedFetch,
  startIngestLicenseStatusMonitor,
  type IngestLicenseInvalidCode
} from "@/lib/enterprise/ingest-license-invalid";
import type { IngestAccessTier } from "@/lib/enterprise/ingest-access-policy";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const ACTIVATE_HREF = "/ingest/activate?next=%2Fadmin-ingest";
const SWITCH_ACCOUNT_HREF = `/ingest/login?app=ingest-admin&next=${encodeURIComponent("/ingest/activate")}`;

function readAccessTier(payload: unknown): IngestAccessTier | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const root = payload as Record<string, unknown>;
  const source = root.data && typeof root.data === "object"
    ? root.data as Record<string, unknown>
    : root;
  const tier = source.accessTier;

  return tier === "none" || tier === "chat_only" || tier === "full_ingest"
    ? tier
    : null;
}

export function IngestLicenseInvalidDialog({
  dialogRef,
  switchingAccount = false,
  onSwitchAccount
}: {
  dialogRef?: RefObject<HTMLElement>;
  switchingAccount?: boolean;
  onSwitchAccount: () => void;
}) {
  return (
    <div
      data-ui-health="ingest-license-invalid-overlay"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
    >
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ingest-license-invalid-title"
        aria-describedby="ingest-license-invalid-description"
        className="w-full max-w-md rounded-3xl border border-white/70 bg-white p-6 shadow-[0_28px_90px_rgba(15,23,42,.28)] sm:p-8"
      >
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-700 ring-1 ring-rose-100">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </span>

        <h2 id="ingest-license-invalid-title" className="mt-5 text-2xl font-semibold text-slate-950">
          卡密已失效
        </h2>
        <p id="ingest-license-invalid-description" className="mt-3 text-sm leading-6 text-slate-600">
          知识投喂、上传和资料管理功能已暂停。请重新激活有效卡密，或切换到其他已授权账号后继续使用。
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <a
            href={ACTIVATE_HREF}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#111816] px-4 text-sm font-semibold text-white transition hover:bg-[#1d2a26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            重新激活
          </a>
          <button
            type="button"
            disabled={switchingAccount}
            onClick={onSwitchAccount}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {switchingAccount ? "正在切换..." : "切换账号"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function IngestLicenseInvalidGate({
  initialCode = null,
  initialAccessTier = "full_ingest",
  children
}: {
  initialCode?: IngestLicenseInvalidCode | null;
  initialAccessTier?: IngestAccessTier;
  children: ReactNode;
}) {
  const router = useRouter();
  const invalidCodeRef = useRef<IngestLicenseInvalidCode | null>(initialCode);
  const accessTierRef = useRef<IngestAccessTier>(initialAccessTier);
  const dialogRef = useRef<HTMLElement>(null);
  const [invalidCode, setInvalidCode] = useState<IngestLicenseInvalidCode | null>(initialCode);
  const [switchingAccount, setSwitchingAccount] = useState(false);

  useClientLayoutEffect(() => {
    let guardEnabled = true;
    const originalFetch = window.fetch;
    const scopedFetch = ((input: RequestInfo | URL, init?: RequestInit) => (
      originalFetch.call(window, input, init)
    )) as typeof fetch;
    const guardedFetch = createIngestLicenseGuardedFetch({
      fetch: scopedFetch,
      baseOrigin: window.location.origin,
      isEnabled: () => guardEnabled,
      getInvalidCode: () => invalidCodeRef.current,
      onInvalid: (code) => {
        if (invalidCodeRef.current === code) {
          return;
        }

        invalidCodeRef.current = code;
        setInvalidCode(code);
      }
    });

    window.fetch = guardedFetch;

    return () => {
      guardEnabled = false;
      if (window.fetch === guardedFetch) {
        window.fetch = originalFetch;
      }
    };
  }, []);

  useEffect(() => {
    return startIngestLicenseStatusMonitor({
      check: async (monitorSignal) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        const timeoutId = window.setTimeout(abort, 8_000);
        monitorSignal.addEventListener("abort", abort, { once: true });

        try {
          const response = await window.fetch("/api/ingest/auth/me?licenseCheck=1", {
            method: "GET",
            cache: "no-store",
            credentials: "include",
            signal: controller.signal
          });

          if (response.ok) {
            const nextTier = readAccessTier(await response.json());

            if (nextTier && nextTier !== accessTierRef.current) {
              router.refresh();
            }
          }
        } catch {
          // Network failures and aborted checks must not invalidate an otherwise usable session.
        } finally {
          window.clearTimeout(timeoutId);
          monitorSignal.removeEventListener("abort", abort);
        }
      },
      windowTarget: {
        addEventListener: (type, listener) => window.addEventListener(type, listener),
        removeEventListener: (type, listener) => window.removeEventListener(type, listener)
      },
      documentTarget: {
        get visibilityState() {
          return document.visibilityState;
        },
        addEventListener: (type, listener) => document.addEventListener(type, listener),
        removeEventListener: (type, listener) => document.removeEventListener(type, listener)
      },
      setIntervalFn: (handler, intervalMs) => window.setInterval(handler, intervalMs),
      clearIntervalFn: (intervalId) => window.clearInterval(intervalId)
    });
  }, [router]);

  useEffect(() => {
    accessTierRef.current = initialAccessTier;
  }, [initialAccessTier]);

  useEffect(() => {
    if (!invalidCode) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";

    const focusable = () => Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []
    );
    focusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const elements = focusable();

      if (elements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown, true);
      previousFocus?.focus();
    };
  }, [invalidCode]);

  const switchAccount = async () => {
    if (switchingAccount) {
      return;
    }

    setSwitchingAccount(true);

    try {
      await window.fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
    } catch {
      // The account switch remains available even if logout cannot reach the server.
    } finally {
      router.replace(SWITCH_ACCOUNT_HREF);
      router.refresh();
    }
  };

  return (
    <>
      {children}
      {invalidCode ? (
        <IngestLicenseInvalidDialog
          dialogRef={dialogRef}
          switchingAccount={switchingAccount}
          onSwitchAccount={() => {
            void switchAccount();
          }}
        />
      ) : null}
    </>
  );
}
