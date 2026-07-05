"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, ShieldAlert } from "lucide-react";

export default function NoAccessPage() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSwitchAccount = async () => {
    setIsSigningOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
      });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-line bg-white p-6 text-center shadow-soft">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-600">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold text-ink">无权访问该入口</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          当前账号的角色或卡密类型与该产品入口不匹配。用户端使用 XT-USER，投喂端使用 XT-INGEST。
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={handleSwitchAccount}
            disabled={isSigningOut}
            className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSigningOut ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LogIn className="h-4 w-4" aria-hidden="true" />
            )}
            {isSigningOut ? "正在退出..." : "退出并返回登录"}
          </button>
        </div>
      </section>
    </main>
  );
}
