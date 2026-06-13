import React from "react";
import { DownloadCopyButton } from "@/components/download-copy-button";
import { getManifestAppReleaseSnapshot, normalizeAppStoreManifest, type AppReleaseSnapshot } from "@/lib/app-store";
import releaseInfo from "../../public/releases/latest.json";

const releaseManifest = normalizeAppStoreManifest(releaseInfo);
const userCompatibilityApkUrl =
  "https://github.com/caizuan2/-AI/releases/latest/download/ai-knowledge-chat-latest.apk";

function requireRelease(release: AppReleaseSnapshot | null) {
  if (!release) {
    throw new Error("Invalid user release manifest.");
  }

  return release;
}

const userRelease = requireRelease(releaseManifest ? getManifestAppReleaseSnapshot(releaseManifest, "user") : null);

const downloadLinks = [
  {
    label: "Android APK 下载",
    href: userRelease.apk_url,
    compatibilityHref: userCompatibilityApkUrl,
    description: "适用于 Android 手机和平板的内部测试安装包。"
  },
  {
    label: "Windows EXE 下载",
    href: userRelease.exe_url,
    compatibilityHref: userRelease.exe_url,
    description: "适用于 Windows 桌面端的内部测试安装包。"
  },
  {
    label: "iPhone iOS IPA",
    href: "",
    compatibilityHref: "",
    description: "iOS 版本请通过 TestFlight 或管理员提供安装包，本页不提供不存在的 IPA 直链。"
  },
  {
    label: "macOS DMG",
    href: "",
    compatibilityHref: "",
    description: "macOS 版本请联系管理员获取，正式发布后建议通过 GitHub Release 或对象存储分发。"
  },
  {
    label: "用户 Web 入口",
    href: userRelease.web_url,
    compatibilityHref: "https://stately-sawine-1efd4d.netlify.app/login?app=user&next=/chat-ui",
    description: "不安装客户端时，可从浏览器进入用户端问答页面。"
  }
];

function getUpdatedDate() {
  return releaseManifest?.updated_at.slice(0, 10) ?? "";
}

export default function DownloadPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto flex max-w-3xl flex-col gap-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-blue-600">用户端安装包</p>
          <h1 className="text-3xl font-bold tracking-tight">AI知识库助手下载</h1>
          <p className="text-sm leading-6 text-slate-600">
            用户端安装后请登录普通用户账号，进入 AI 知识库助手问答页面。
          </p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-950">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-white px-3 py-1 font-semibold text-blue-700">
              最新版本 {userRelease.version}
            </span>
            <span>构建号：{userRelease.build}</span>
            <span>更新日期：{getUpdatedDate()}</span>
          </div>
          <ul className="mt-4 list-disc space-y-1 pl-5 leading-6">
            {userRelease.changelog.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {downloadLinks.map((link) => (
            <article
              key={link.label}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-blue-300 hover:bg-blue-50"
            >
              <span className="block text-base font-semibold text-slate-950">{link.label}</span>
              <span className="mt-2 block text-sm leading-6 text-slate-600">{link.description}</span>
              {link.href ? (
                <>
                  <div className="mt-4 flex flex-col gap-2">
                    <a
                      href={link.href}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                      打开下载链接
                    </a>
                    <DownloadCopyButton value={link.href} />
                  </div>
                  <span className="mt-3 block break-all text-xs text-slate-500">
                    兼容链接：{link.compatibilityHref}
                  </span>
                </>
              ) : (
                <span className="mt-4 inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500">
                  即将提供 / 联系管理员获取
                </span>
              )}
            </article>
          ))}
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          <p>Android 安装时如提示未知来源，请在系统设置中允许安装。</p>
          <p>新版 APK 支持 Web 层 OTA 后，普通界面、JS 和 CSS 可自动获取更新；如更新异常，仍可重新下载安装包。</p>
          <p>Windows 如提示未知发布者，是因为未进行代码签名，内部测试可继续安装。</p>
          <p>iOS IPA 和 macOS DMG 需要在 macOS / Xcode 环境完成签名与发布，不提供假安装包直链。</p>
        </div>
      </section>
    </main>
  );
}
