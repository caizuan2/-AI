import React from "react";

const downloadLinks = [
  {
    label: "Android APK 下载",
    href: "/downloads/ai-knowledge-chat.apk",
    description: "适用于 Android 手机和平板的内部测试安装包。"
  },
  {
    label: "Windows EXE 下载",
    href: "/downloads/ai-knowledge-chat.exe",
    description: "适用于 Windows 桌面端的内部测试安装包。"
  }
];

export default function DownloadPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto flex max-w-3xl flex-col gap-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-blue-600">用户端安装包</p>
          <h1 className="text-3xl font-bold tracking-tight">AI知识库助手下载</h1>
          <p className="text-sm leading-6 text-slate-600">
            请选择对应系统下载安装包。当前安装包仅打开用户端 AI 聊天页面，不包含管理员入口。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {downloadLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-blue-300 hover:bg-blue-50"
            >
              <span className="block text-base font-semibold text-slate-950">{link.label}</span>
              <span className="mt-2 block text-sm leading-6 text-slate-600">{link.description}</span>
            </a>
          ))}
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          <p>Android 安装时如提示未知来源，请在系统设置中允许安装。</p>
          <p>Windows 如提示未知发布者，是因为未进行代码签名，内部测试可继续安装。</p>
        </div>
      </section>
    </main>
  );
}
