"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { USER_CHAT_LOGIN_URL } from "../api";
import { useUserLicenseGuard } from "./UserLicenseGuard";

type AuthState = "loading" | "ready" | "network-error";

export function shouldRedirectChatUiAuth(status: number) {
  return status === 401;
}

export function isChatUiAuthReady(status: number) {
  return status >= 200 && status < 300;
}

export function ClientAuthGate({ children }: { children: React.ReactNode }) {
  const licenseGuard = useUserLicenseGuard();
  const router = useRouter();
  const [authState, setAuthState] = React.useState<AuthState>("loading");
  const [retryCount, setRetryCount] = React.useState(0);

  React.useEffect(() => {
    let active = true;

    async function checkSession() {
      setAuthState("loading");

      try {
        const response = await fetch("/api/auth/me", {
          method: "GET",
          cache: "no-store"
        });

        if (!active) {
          return;
        }

        if (isChatUiAuthReady(response.status)) {
          setAuthState("ready");
          return;
        }

        if (shouldRedirectChatUiAuth(response.status)) {
          router.replace(USER_CHAT_LOGIN_URL);
          return;
        }

        setAuthState("network-error");
      } catch {
        if (active) {
          setAuthState("network-error");
        }
      }
    }

    void checkSession();

    return () => {
      active = false;
    };
  }, [router, retryCount]);

  let content: React.ReactNode;

  if (authState === "ready") {
    content = children;
  } else if (authState === "network-error") {
    content = (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-center text-slate-700">
        <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
          <p className="text-base font-semibold text-slate-950">网络异常，请稍后重试</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">暂时无法确认登录状态，当前账号不会被退出。</p>
          <button
            type="button"
            onClick={() => setRetryCount((value) => value + 1)}
            className="focus-ring mt-5 h-11 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            重试
          </button>
        </div>
      </main>
    );
  } else {
    content = (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-center text-sm font-semibold text-slate-500">
        正在检查登录状态...
      </main>
    );
  }

  return (
    <>
      {content}
      {licenseGuard}
    </>
  );
}
