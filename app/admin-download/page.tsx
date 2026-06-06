import React from "react";

const githubReleaseUrl =
  "https://github.com/caizuan2/-AI/releases/download/v1.0.0-admin-windows/ai-knowledge-admin-latest.exe";

export default function AdminDownloadPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto flex max-w-3xl flex-col gap-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-emerald-600">管理员端安装包</p>
          <h1 className="text-3xl font-bold tracking-tight">AI知识库管理后台下载</h1>
          <p className="text-sm leading-6 text-slate-600">
            仅供授权管理员使用，请使用管理员账号登录。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <a
            href="/downloads/admin/ai-knowledge-admin-latest.apk"
            className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            <span className="block text-base font-semibold text-slate-950">Android APK 下载</span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">
              管理员端 Android 内部测试安装包。
            </span>
          </a>

          <a
            href={githubReleaseUrl}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            <span className="block text-base font-semibold text-slate-950">Windows EXE 下载</span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">
              Windows 版本请联系管理员获取，或前往 GitHub Release 下载。
            </span>
          </a>
        </div>

        <a
          href="/ingest"
          className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          打开管理员网页版入口
        </a>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          <p>Android 安装时如提示未知来源，请在系统设置中允许安装。</p>
          <p>Windows 如提示未知发布者，是因为未进行代码签名，内部测试可继续安装。</p>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-900">
          管理员端仅供授权人员使用，请勿公开分享安装包。
        </div>
      </section>
    </main>
  );
}
