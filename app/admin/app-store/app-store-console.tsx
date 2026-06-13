"use client";

import * as React from "react";
import { GitBranch, PackagePlus, RefreshCw, Rocket, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  addVersion,
  getActiveVersion,
  listVersions,
  rollbackService,
  resolveDistributedDownload,
  type AppStoreChannel,
  type AppStoreManifest,
  type AppStorePlatform,
  type AppStoreVersion
} from "@/lib/app-store";

interface AppStoreConsoleProps {
  initialManifest: AppStoreManifest;
}

const channelLabels: Record<AppStoreChannel, string> = {
  canary: "Canary",
  beta: "Beta",
  stable: "Stable"
};

const channelDescriptions: Record<AppStoreChannel, string> = {
  canary: "0-9",
  beta: "10-49",
  stable: "50-99"
};

const platformLabels: Record<AppStorePlatform, string> = {
  android: "Android APK",
  windows: "Windows EXE",
  ios: "iOS",
  macos: "macOS",
  web: "Web",
  electron: "Electron"
};

function getNextPatchVersion(version: string) {
  const parts = version.split(".").map((item) => Number(item));

  if (parts.length !== 3 || parts.some((item) => !Number.isFinite(item))) {
    return version;
  }

  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

function getDownloadPreview(version: AppStoreVersion, platform: AppStorePlatform) {
  if (platform === "android") {
    return version.apk_url;
  }

  if (platform === "windows" || platform === "electron") {
    return version.exe_url;
  }

  if (platform === "web") {
    return version.web_url;
  }

  return version.download_page;
}

export function AppStoreConsole({ initialManifest }: AppStoreConsoleProps) {
  const [manifest, setManifest] = React.useState(initialManifest);
  const appKeys = Object.keys(manifest.apps);
  const [selectedAppKey, setSelectedAppKey] = React.useState(appKeys[0] ?? "user");
  const selectedApp = manifest.apps[selectedAppKey] ?? manifest.apps[appKeys[0]];
  const activeVersion = selectedApp ? getActiveVersion(selectedApp) : null;
  const [draftVersion, setDraftVersion] = React.useState(activeVersion ? getNextPatchVersion(activeVersion.version) : "1.0.0");
  const [draftBuild, setDraftBuild] = React.useState(activeVersion ? String(activeVersion.build + 1) : "1");
  const [draftChannel, setDraftChannel] = React.useState<AppStoreChannel>("stable");
  const [draftRollout, setDraftRollout] = React.useState("100");
  const [draftForceUpdate, setDraftForceUpdate] = React.useState(false);

  React.useEffect(() => {
    if (!selectedApp) {
      return;
    }

    const nextActiveVersion = getActiveVersion(selectedApp);
    setDraftVersion(nextActiveVersion ? getNextPatchVersion(nextActiveVersion.version) : "1.0.0");
    setDraftBuild(nextActiveVersion ? String(nextActiveVersion.build + 1) : "1");
  }, [selectedApp]);

  if (!selectedApp || !activeVersion) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-white px-4 py-12 text-center text-sm text-muted">
        暂无可用应用。
      </div>
    );
  }

  const currentActiveVersion = activeVersion;
  const versions = listVersions(selectedApp);
  const appCount = appKeys.length;
  const versionCount = appKeys.reduce((count, key) => count + manifest.apps[key].versions.length, 0);
  const androidDecision = resolveDistributedDownload(selectedApp, {
    userId: "canary-device-preview",
    platform: "android"
  });
  const windowsDecision = resolveDistributedDownload(selectedApp, {
    userId: "windows-device-preview",
    platform: "windows"
  });
  const webDecision = resolveDistributedDownload(selectedApp, {
    userId: "web-device-preview",
    platform: "web"
  });

  function publishDraft() {
    const build = Number(draftBuild);
    const rollout = Math.max(0, Math.min(100, Number(draftRollout)));

    if (!selectedApp || !Number.isFinite(build) || !Number.isFinite(rollout)) {
      return;
    }

    const nextVersion: AppStoreVersion = {
      version: draftVersion.trim() || currentActiveVersion.version,
      build,
      channel: draftChannel,
      rollout,
      minimum_build: currentActiveVersion.minimum_build,
      force_update: draftForceUpdate,
      web_url: currentActiveVersion.web_url,
      apk_url: currentActiveVersion.apk_url,
      exe_url: currentActiveVersion.exe_url,
      download_page: currentActiveVersion.download_page,
      changelog: ["Prepared release draft"],
      created_at: new Date().toISOString()
    };

    setManifest((current) => ({
      ...current,
      updated_at: new Date().toISOString(),
      apps: {
        ...current.apps,
        [selectedAppKey]: addVersion(current.apps[selectedAppKey], nextVersion, true)
      }
    }));
  }

  function rollback(version: string) {
    setManifest((current) => rollbackService.rollbackToVersion(current, selectedAppKey, version));
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardDescription>应用数量</CardDescription>
              <CardTitle className="mt-2 text-3xl">{appCount}</CardTitle>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <PackagePlus className="h-5 w-5" />
            </span>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardDescription>版本记录</CardDescription>
              <CardTitle className="mt-2 text-3xl">{versionCount}</CardTitle>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-700">
              <GitBranch className="h-5 w-5" />
            </span>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardDescription>当前 Active</CardDescription>
              <CardTitle className="mt-2 text-3xl">{currentActiveVersion.version}</CardTitle>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-700">
              <Rocket className="h-5 w-5" />
            </span>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>应用列表</CardTitle>
          <CardDescription>当前 manifest 中注册的应用和平台。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {appKeys.map((appKey) => {
              const app = manifest.apps[appKey];
              const appActiveVersion = getActiveVersion(app);
              const selected = selectedAppKey === appKey;

              return (
                <button
                  key={appKey}
                  type="button"
                  onClick={() => setSelectedAppKey(appKey)}
                  className={`focus-ring rounded-lg border px-4 py-3 text-left transition ${
                    selected ? "border-teal-300 bg-teal-50 text-teal-900" : "border-line bg-white text-ink hover:bg-slate-50"
                  }`}
                >
                  <span className="block text-sm font-semibold">{app.name}</span>
                  <span className="mt-1 block text-xs text-muted">{app.id} · {appActiveVersion?.version ?? "-"}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>发布新版本</CardTitle>
            <CardDescription>为 {selectedApp.name} 准备新的 active release。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-ink">Version</span>
                <input
                  value={draftVersion}
                  onChange={(event) => setDraftVersion(event.target.value)}
                  className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">Build</span>
                <input
                  value={draftBuild}
                  onChange={(event) => setDraftBuild(event.target.value)}
                  inputMode="numeric"
                  className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="text-sm font-medium text-ink">Channel</span>
                <select
                  value={draftChannel}
                  onChange={(event) => setDraftChannel(event.target.value as AppStoreChannel)}
                  className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
                >
                  <option value="stable">Stable</option>
                  <option value="beta">Beta</option>
                  <option value="canary">Canary</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">Rollout %</span>
                <input
                  value={draftRollout}
                  onChange={(event) => setDraftRollout(event.target.value)}
                  inputMode="numeric"
                  className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
                />
              </label>
              <label className="flex items-end gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
                <input
                  type="checkbox"
                  checked={draftForceUpdate}
                  onChange={(event) => setDraftForceUpdate(event.target.checked)}
                  className="h-4 w-4 rounded border-line"
                />
                <span className="text-sm font-medium text-ink">Force update</span>
              </label>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={publishDraft}>
                <Rocket className="h-4 w-4" />
                生成发布草案
              </Button>
              <Button variant="outline" onClick={() => rollback(currentActiveVersion.version)}>
                <RefreshCw className="h-4 w-4" />
                重载 Active
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>分发策略</CardTitle>
            <CardDescription>hash(userId) % 100 的用户分层。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(["canary", "beta", "stable"] as AppStoreChannel[]).map((channel) => (
              <div key={channel} className="flex items-center justify-between rounded-lg border border-line bg-canvas px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{channelLabels[channel]}</p>
                  <p className="mt-1 text-xs text-muted">bucket {channelDescriptions[channel]}</p>
                </div>
                <Badge variant={channel === "stable" ? "default" : "secondary"}>
                  {versions.filter((version) => version.channel === channel).length} releases
                </Badge>
              </div>
            ))}
            <div className="rounded-lg border border-line bg-white p-4 text-sm leading-6 text-muted">
              <p>Android：{androidDecision?.version.version ?? "-"} · {androidDecision?.url ?? "-"}</p>
              <p>Windows：{windowsDecision?.version.version ?? "-"} · {windowsDecision?.url ?? "-"}</p>
              <p>Web：{webDecision?.version.version ?? "-"} · {webDecision?.url ?? "-"}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>版本历史</CardTitle>
            <CardDescription>{selectedApp.name} 的多版本目录和回滚入口。</CardDescription>
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-700">
            <SlidersHorizontal className="h-5 w-5" />
          </span>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase text-muted">
                <tr>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Version</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Build</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Channel</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Rollout</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Force</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Download</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {versions.map((version) => (
                  <tr key={`${version.version}-${version.build}`}>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-ink">
                      {version.version}
                      {version.version === selectedApp.active_version ? (
                        <Badge className="ml-2" variant="default">Active</Badge>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{version.build}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Badge variant={version.channel === "stable" ? "default" : "secondary"}>
                        {channelLabels[version.channel]}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{version.rollout}%</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{version.force_update ? "Yes" : "No"}</td>
                    <td className="max-w-[360px] truncate px-3 py-3 text-muted">
                      {getDownloadPreview(version, selectedApp.platforms[0] ?? "web")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Button
                        size="sm"
                        variant={version.version === selectedApp.active_version ? "secondary" : "outline"}
                        onClick={() => rollback(version.version)}
                      >
                        <RotateCcw className="h-4 w-4" />
                        回滚
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CDN 分发入口</CardTitle>
          <CardDescription>当前 active release 的多平台资源地址。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {selectedApp.platforms.map((platform) => (
              <div key={platform} className="rounded-lg border border-line bg-canvas px-4 py-3">
                <p className="text-sm font-semibold text-ink">{platformLabels[platform]}</p>
                <p className="mt-1 break-all text-xs leading-5 text-muted">
                  {getDownloadPreview(currentActiveVersion, platform) || "-"}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
