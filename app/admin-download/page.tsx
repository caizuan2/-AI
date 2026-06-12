import React from "react";
import { DownloadCopyButton } from "@/components/download-copy-button";
import releaseInfo from "../../public/releases/latest.json";

export const metadata = {
  title: "AI知识库管理后台下载",
  description: "管理员端 APK、Windows EXE、iOS、macOS 和 Web 管理端入口下载页",
};

const adminRelease = releaseInfo.admin;

const items = [
  {
    icon: "📱",
    title: "Android APK",
    desc: "适用于安卓手机和平板，安装后请使用管理员账号登录。",
    href: adminRelease.apk_url,
    button: "下载管理员 APK",
  },
  {
    icon: "💻",
    title: "Windows EXE",
    desc: "适用于 Windows 电脑，安装后进入管理员登录页面。",
    href: adminRelease.exe_url,
    button: "下载管理员 EXE",
  },
  {
    icon: "🍎",
    title: "iPhone iOS IPA",
    desc: "iOS 管理端请通过 TestFlight 或管理员提供安装包，本页不提供不存在的 IPA 直链。",
    href: "",
    button: "联系管理员获取",
  },
  {
    icon: "🖥️",
    title: "macOS DMG",
    desc: "macOS 管理端请联系管理员获取，正式发布后建议通过 GitHub Release 或对象存储分发。",
    href: "",
    button: "即将提供",
  },
  {
    icon: "🌐",
    title: "Web 管理端",
    desc: "无需安装，直接通过浏览器访问管理员后台。",
    href: adminRelease.web_url,
    button: "打开 Web 管理端",
  },
];

function getUpdatedDate() {
  return releaseInfo.updated_at.slice(0, 10);
}

export default function AdminDownloadPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-4xl">
        <div className="mb-8 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <p className="mb-3 text-sm font-semibold text-blue-600">
            AI Knowledge Admin
          </p>

          <h1 className="text-3xl font-bold tracking-tight">
            AI知识库管理后台下载
          </h1>

          <p className="mt-4 text-base leading-7 text-slate-600">
            本页面仅供授权管理员使用。请选择 Android APK、Windows EXE、iOS、macOS
            或 Web 管理端入口。安装后请使用管理员账号登录。
          </p>

          <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-white px-3 py-1 font-semibold text-emerald-700">
                最新版本 {adminRelease.version}
              </span>
              <span>构建号：{adminRelease.build}</span>
              <span>更新日期：{getUpdatedDate()}</span>
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {adminRelease.changelog.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            管理员端具备知识库投喂和管理能力，请勿公开分享安装包或账号信息。
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {items.map((item) => (
            <article
              key={item.title}
              className="flex min-h-[260px] flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
                {item.icon}
              </div>

              <h2 className="text-xl font-bold">{item.title}</h2>

              <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">
                {item.desc}
              </p>

              {item.href ? (
                <>
                  <div className="mt-6 flex flex-col gap-2">
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
                    >
                      {item.button}
                    </a>
                    <DownloadCopyButton value={item.href} />
                  </div>

                  <p className="mt-3 break-all text-xs leading-5 text-slate-400">
                    {item.href}
                  </p>
                </>
              ) : (
                <span className="mt-6 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
                  {item.button}
                </span>
              )}
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold">安装提示</h2>

          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
            <li>Android 安装时如提示未知来源，请在系统设置中允许安装。</li>
            <li>Windows 如提示未知发布者，是因为安装包未进行代码签名，内部测试可继续安装。</li>
            <li>iOS IPA 和 macOS DMG 需要在 macOS / Xcode 环境完成签名与发布，不提供假安装包直链。</li>
            <li>登录后应进入管理员后台 /ingest，不应进入用户端 /chat-ui。</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
