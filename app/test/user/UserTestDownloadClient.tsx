"use client";

import { useEffect, useMemo, useState } from "react";

type TestVersionManifest = {
  appName?: string;
  channel?: string;
  version?: string;
  buildTime?: string;
  apkUrl?: string;
  windowsDebugUrl?: string;
  windowsReleaseUrl?: string;
  changelog?: string[];
};

const baseUrl = "https://stately-sawine-1efd4d.netlify.app";
const fallbackManifest: Required<TestVersionManifest> = {
  appName: "AI知识库助手",
  channel: "test",
  version: "待生成",
  buildTime: "",
  apkUrl: `${baseUrl}/downloads/test/user/ai-knowledge-user-test.apk`,
  windowsDebugUrl: `${baseUrl}/downloads/test/user/ai-knowledge-user-windows-debug.zip`,
  windowsReleaseUrl: `${baseUrl}/downloads/test/user/ai-knowledge-user-windows-release.zip`,
  changelog: ["用户端测试版通道已建立", "测试版与正式版下载链接分离"],
};

function formatBuildTime(value: string) {
  if (!value) {
    return "待生成";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
}

export default function UserTestDownloadClient() {
  const [manifest, setManifest] =
    useState<Required<TestVersionManifest>>(fallbackManifest);

  useEffect(() => {
    let cancelled = false;

    async function loadManifest() {
      try {
        const response = await fetch("/downloads/test/user/version.json", {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as TestVersionManifest;
        if (!cancelled) {
          setManifest({
            ...fallbackManifest,
            ...data,
            changelog:
              Array.isArray(data.changelog) && data.changelog.length > 0
                ? data.changelog
                : fallbackManifest.changelog,
          });
        }
      } catch {
        if (!cancelled) {
          setManifest(fallbackManifest);
        }
      }
    }

    loadManifest();

    return () => {
      cancelled = true;
    };
  }, []);

  const downloads = useMemo(
    () => [
      {
        title: "Android APK 测试包",
        description: "用于 Android 手机安装测试。该链接不会覆盖正式 APK。",
        href: manifest.apkUrl,
        button: "下载测试 APK",
      },
      {
        title: "Windows 调测版",
        description: "Debug 构建，适合快速确认页面入口和运行状态。",
        href: manifest.windowsDebugUrl,
        button: "下载 Windows Debug ZIP",
      },
      {
        title: "Windows 测试正式版",
        description: "Release 构建，仅用于内部测试，不等同正式发布。",
        href: manifest.windowsReleaseUrl,
        button: "下载 Windows Release ZIP",
      },
    ],
    [manifest.apkUrl, manifest.windowsDebugUrl, manifest.windowsReleaseUrl],
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto flex max-w-4xl flex-col gap-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-blue-600">用户端测试通道</p>
          <h1 className="text-3xl font-bold tracking-tight">
            AI知识库助手 - 用户端测试版
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            这是测试版，仅用于内部测试，确认无问题后再发布正式版。测试包和正式下载链接已分离，不会覆盖正式 APK 或 EXE。
          </p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-950">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-white px-3 py-1 font-semibold text-blue-700">
              当前测试版本 {manifest.version}
            </span>
            <span>渠道：{manifest.channel}</span>
            <span>更新时间：{formatBuildTime(manifest.buildTime)}</span>
          </div>

          <ul className="mt-4 list-disc space-y-1 pl-5 leading-6">
            {manifest.changelog.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {downloads.map((item) => (
            <article
              key={item.title}
              className="flex min-h-[230px] flex-col rounded-2xl border border-slate-200 bg-slate-50 p-5"
            >
              <h2 className="text-lg font-bold">{item.title}</h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">
                {item.description}
              </p>
              <a
                href={item.href}
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                {item.button}
              </a>
              <p className="mt-3 break-all text-xs leading-5 text-slate-500">
                {item.href}
              </p>
            </article>
          ))}
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          <p>
            Windows 版本请下载 zip 后解压整个文件夹，不要单独运行 exe，否则可能缺少 DLL。
          </p>
          <p>测试版可能存在问题，不要发给正式用户。</p>
          <p>
            Codex 每次优化后只能更新测试版链接；只有明确收到“测试通过，发布正式版”后，才允许执行正式发布。
          </p>
        </div>
      </section>
    </main>
  );
}
