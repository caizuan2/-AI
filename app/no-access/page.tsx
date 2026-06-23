import Link from "next/link";

export default function NoAccessPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-rose-600">No Access</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">当前账号无权访问该产品</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          请确认登录账号、卡密类型和产品入口一致。用户端使用 XT-USER，投喂端使用 XT-INGEST。
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white"
        >
          返回登录
        </Link>
      </section>
    </main>
  );
}
