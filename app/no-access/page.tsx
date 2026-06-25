import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function NoAccessPage() {
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
          <Link
            href="/login"
            className="focus-ring inline-flex h-10 items-center justify-center rounded-md bg-ink px-4 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            返回登录
          </Link>
        </div>
      </section>
    </main>
  );
}
