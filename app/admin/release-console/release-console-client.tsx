"use client";

import * as React from "react";
import {
  Activity,
  ExternalLink,
  GitBranch,
  Globe2,
  MonitorDown,
  RefreshCw,
  Rocket,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type GitHubWorkflowRunSummary = {
  id: number;
  name: string;
  displayTitle: string;
  runNumber: number;
  event: string;
  status: string;
  conclusion: string | null;
  headBranch: string | null;
  headSha: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type GitHubReleaseSummary = {
  id: number;
  tagName: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  htmlUrl: string;
  publishedAt: string | null;
  assets: Array<{
    id: number;
    name: string;
    url: string;
    size: number;
    downloadCount: number;
  }>;
};

export type ReleaseConsoleInitialData = {
  repo: string;
  apiBase: string;
  latestJsonUrl: string;
  fetchedAt: string;
  runs: GitHubWorkflowRunSummary[];
  releases: GitHubReleaseSummary[];
  latestJson: unknown;
};

type Channel = "canary" | "beta" | "stable";

type GitHubWorkflowRunResponse = {
  workflow_runs?: RawGitHubWorkflowRun[];
};

type RawGitHubWorkflowRun = {
  id?: number;
  name?: string | null;
  display_title?: string;
  run_number?: number;
  event?: string;
  status?: string;
  conclusion?: string | null;
  head_branch?: string | null;
  head_sha?: string;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
};

type GitHubReleaseResponse = RawGitHubRelease[];

type RawGitHubRelease = {
  id?: number;
  tag_name?: string;
  name?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  html_url?: string;
  published_at?: string | null;
  assets?: RawGitHubReleaseAsset[];
};

type RawGitHubReleaseAsset = {
  id?: number;
  name?: string;
  browser_download_url?: string;
  size?: number;
  download_count?: number;
};

type ManifestSummary = {
  version: string;
  build: number | null;
  releaseTag: string;
  updatedAt: string;
  apkUrl: string;
  exeUrl: string;
  webUrl: string;
  forceUpdate: boolean;
  rollout: number;
  channel: string;
};

const channelLabels: Record<Channel, string> = {
  canary: "Canary",
  beta: "Beta",
  stable: "Stable"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getActiveAppStoreVersion(manifest: Record<string, unknown>) {
  const apps = isRecord(manifest.apps) ? manifest.apps : null;
  const user = apps && isRecord(apps.user) ? apps.user : null;
  const versions = user && Array.isArray(user.versions) ? user.versions.filter(isRecord) : [];
  const activeVersion = stringValue(user?.active_version);

  return versions.find((version) => version.version === activeVersion) ?? versions[0] ?? null;
}

function summarizeManifest(value: unknown): ManifestSummary {
  if (!isRecord(value)) {
    return {
      version: "-",
      build: null,
      releaseTag: "-",
      updatedAt: "-",
      apkUrl: "",
      exeUrl: "",
      webUrl: "",
      forceUpdate: false,
      rollout: 0,
      channel: "-"
    };
  }

  const activeAppStoreVersion = getActiveAppStoreVersion(value);
  const legacyUser = isRecord(value.user) ? value.user : null;
  const source = activeAppStoreVersion ?? legacyUser ?? value;
  const version = stringValue(source.version) || stringValue(value.version) || "-";
  const build = numberValue(source.build) ?? numberValue(value.build);
  const channel = stringValue(source.channel) || "stable";

  return {
    version,
    build,
    releaseTag: version.startsWith("v") ? version : `v${version}`,
    updatedAt: stringValue(value.updated_at) || "-",
    apkUrl: stringValue(source.apk_url) || stringValue(value.apk_url),
    exeUrl: stringValue(source.exe_url) || stringValue(value.exe_url),
    webUrl: stringValue(source.web_url) || stringValue(value.web_url),
    forceUpdate: source.force_update === true,
    rollout: numberValue(source.rollout) ?? 100,
    channel
  };
}

function getRunState(run: GitHubWorkflowRunSummary | undefined) {
  if (!run) {
    return { label: "unknown", variant: "outline" as const, progress: 0 };
  }

  if (run.status !== "completed") {
    return { label: run.status, variant: "warning" as const, progress: 55 };
  }

  if (run.conclusion === "success") {
    return { label: "success", variant: "default" as const, progress: 100 };
  }

  return { label: run.conclusion ?? "failed", variant: "warning" as const, progress: 100 };
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "-";
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function findAsset(release: GitHubReleaseSummary | undefined, extension: ".apk" | ".exe") {
  return release?.assets.find((asset) => asset.name.toLowerCase().endsWith(extension)) ?? null;
}

function toWorkflowRuns(data: GitHubWorkflowRunResponse | null): GitHubWorkflowRunSummary[] {
  return (data?.workflow_runs ?? []).slice(0, 8).map((run) => ({
    id: run.id ?? 0,
    name: run.name ?? "Release workflow",
    displayTitle: run.display_title ?? "Release workflow",
    runNumber: run.run_number ?? 0,
    event: run.event ?? "-",
    status: run.status ?? "unknown",
    conclusion: run.conclusion ?? null,
    headBranch: run.head_branch ?? null,
    headSha: run.head_sha ?? "",
    htmlUrl: run.html_url ?? "",
    createdAt: run.created_at ?? "",
    updatedAt: run.updated_at ?? ""
  }));
}

function toReleases(data: GitHubReleaseResponse | null): GitHubReleaseSummary[] {
  return (data ?? []).slice(0, 8).map((release) => ({
    id: release.id ?? 0,
    tagName: release.tag_name ?? "-",
    name: release.name ?? release.tag_name ?? "-",
    draft: release.draft === true,
    prerelease: release.prerelease === true,
    htmlUrl: release.html_url ?? "",
    publishedAt: release.published_at ?? null,
    assets: (release.assets ?? []).map((asset) => ({
      id: asset.id ?? 0,
      name: asset.name ?? "-",
      url: asset.browser_download_url ?? "",
      size: asset.size ?? 0,
      downloadCount: asset.download_count ?? 0
    }))
  }));
}

async function fetchJson<T>(url: string, token: string): Promise<T | null> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

async function refreshDashboard(data: ReleaseConsoleInitialData, token: string): Promise<ReleaseConsoleInitialData> {
  const [runs, releases, latestJson] = await Promise.all([
    fetchJson<GitHubWorkflowRunResponse>(`${data.apiBase}/actions/workflows/release.yml/runs?per_page=8`, token),
    fetchJson<GitHubReleaseResponse>(`${data.apiBase}/releases?per_page=8`, token),
    fetchJson<unknown>(data.latestJsonUrl, "")
  ]);

  return {
    ...data,
    fetchedAt: new Date().toISOString(),
    runs: runs ? toWorkflowRuns(runs) : data.runs,
    releases: releases ? toReleases(releases) : data.releases,
    latestJson: latestJson ?? data.latestJson
  };
}

type ReleaseConsoleClientProps = {
  initialData: ReleaseConsoleInitialData;
};

export function ReleaseConsoleClient({ initialData }: ReleaseConsoleClientProps) {
  const [data, setData] = React.useState(initialData);
  const [token, setToken] = React.useState("");
  const [refName, setRefName] = React.useState("main");
  const [channel, setChannel] = React.useState<Channel>("stable");
  const [rollout, setRollout] = React.useState(100);
  const [forceUpdate, setForceUpdate] = React.useState(false);
  const [rollbackTag, setRollbackTag] = React.useState(initialData.releases[1]?.tagName ?? initialData.releases[0]?.tagName ?? "");
  const [isBusy, setIsBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const latestRun = data.runs[0];
  const latestRelease = data.releases[0];
  const manifest = summarizeManifest(data.latestJson);
  const runState = getRunState(latestRun);
  const apkAsset = findAsset(latestRelease, ".apk");
  const exeAsset = findAsset(latestRelease, ".exe");

  React.useEffect(() => {
    let active = true;

    refreshDashboard(initialData, "")
      .then((nextData) => {
        if (!active) {
          return;
        }

        setData(nextData);
      })
      .catch(() => {
        if (active) {
          setMessage("GitHub 状态加载失败，可稍后手动刷新。");
        }
      });

    return () => {
      active = false;
    };
  }, [initialData]);

  React.useEffect(() => {
    if (!rollbackTag && data.releases.length > 0) {
      setRollbackTag(data.releases[1]?.tagName ?? data.releases[0]?.tagName ?? "");
    }
  }, [data.releases, rollbackTag]);

  async function refresh() {
    setIsBusy(true);
    setMessage("");

    try {
      setData(await refreshDashboard(data, token.trim()));
      setMessage("状态已刷新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刷新失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function dispatchWorkflow(mode: "release" | "rollback") {
    if (!token.trim()) {
      setMessage("请输入具有 Actions write 权限的 GitHub token。");
      return;
    }

    const targetRef = mode === "rollback" ? rollbackTag : refName;

    if (!targetRef) {
      setMessage("请选择要执行的 ref 或回滚版本。");
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch(`${data.apiBase}/actions/workflows/release.yml/dispatches`, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token.trim()}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        body: JSON.stringify({
          ref: targetRef,
          inputs: {
            mode,
            channel,
            rollout: String(rollout),
            force_update: forceUpdate ? "true" : "false",
            rollback_tag: mode === "rollback" ? rollbackTag : ""
          }
        })
      });

      if (response.status !== 204) {
        const errorText = await response.text();
        throw new Error(errorText || `GitHub API returned ${response.status}.`);
      }

      setMessage(mode === "rollback" ? "回滚 workflow 已触发。" : "新发布 workflow 已触发。");
      setTimeout(() => void refresh(), 1800);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GitHub Actions API 调用失败。");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardDescription>GitHub Actions</CardDescription>
              <CardTitle className="mt-2 text-2xl">{runState.label}</CardTitle>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <Activity className="h-5 w-5" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-teal-500" style={{ width: `${runState.progress}%` }} />
            </div>
            <p className="mt-3 text-xs text-muted">Build #{latestRun?.runNumber ?? "-"} · {latestRun?.headBranch ?? "-"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardDescription>Current Version</CardDescription>
              <CardTitle className="mt-2 text-2xl">{manifest.version}</CardTitle>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-700">
              <GitBranch className="h-5 w-5" />
            </span>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted">Build {manifest.build ?? "-"} · {manifest.releaseTag}</p>
            <p className="mt-2 text-xs text-muted">Updated {formatDate(manifest.updatedAt)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardDescription>APK Build</CardDescription>
              <CardTitle className="mt-2 text-2xl">{apkAsset || manifest.apkUrl ? "ready" : "missing"}</CardTitle>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-700">
              <Smartphone className="h-5 w-5" />
            </span>
          </CardHeader>
          <CardContent>
            <p className="truncate text-xs text-muted">{apkAsset?.name ?? manifest.apkUrl ?? "-"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardDescription>Windows EXE</CardDescription>
              <CardTitle className="mt-2 text-2xl">{exeAsset || manifest.exeUrl ? "ready" : "missing"}</CardTitle>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-700">
              <MonitorDown className="h-5 w-5" />
            </span>
          </CardHeader>
          <CardContent>
            <p className="truncate text-xs text-muted">{exeAsset?.name ?? manifest.exeUrl ?? "-"}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>发布状态</CardTitle>
            <CardDescription>来自 GitHub Actions、Releases API 和 latest.json。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-line text-xs uppercase text-muted">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Run</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Event</th>
                    <th className="px-3 py-3 font-semibold">Branch</th>
                    <th className="px-3 py-3 font-semibold">Updated</th>
                    <th className="px-3 py-3 font-semibold">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.runs.map((run) => {
                    const state = getRunState(run);

                    return (
                      <tr key={run.id}>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-ink">#{run.runNumber}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <Badge variant={state.variant}>{state.label}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-muted">{run.event}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-muted">{run.headBranch ?? "-"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDate(run.updatedAt)}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <a className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-900" href={run.htmlUrl} target="_blank" rel="noreferrer">
                            Open
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                  {data.runs.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-sm text-muted" colSpan={6}>暂无 GitHub Actions 记录。</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>控制台</CardTitle>
            <CardDescription>调用 GitHub Actions API 触发发布或回滚。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink">GitHub Token</span>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                type="password"
                placeholder="ghp_..."
                className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Release ref</span>
              <input
                value={refName}
                onChange={(event) => setRefName(event.target.value)}
                className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-ink">Channel</span>
                <select
                  value={channel}
                  onChange={(event) => setChannel(event.target.value as Channel)}
                  className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
                >
                  <option value="canary">Canary</option>
                  <option value="beta">Beta</option>
                  <option value="stable">Stable</option>
                </select>
              </label>
              <label className="flex items-end gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
                <input
                  type="checkbox"
                  checked={forceUpdate}
                  onChange={(event) => setForceUpdate(event.target.checked)}
                  className="h-4 w-4 rounded border-line"
                />
                <span className="text-sm font-medium text-ink">Force update</span>
              </label>
            </div>
            <label className="block">
              <span className="flex items-center justify-between text-sm font-medium text-ink">
                <span>Rollout</span>
                <span>{rollout}%</span>
              </span>
              <input
                value={rollout}
                onChange={(event) => setRollout(Number(event.target.value))}
                type="range"
                min={0}
                max={100}
                step={10}
                className="mt-3 w-full"
              />
              <div className="mt-2 flex justify-between text-xs text-muted">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={() => void dispatchWorkflow("release")} disabled={isBusy}>
                <Rocket className="h-4 w-4" />
                Trigger Deploy
              </Button>
              <Button variant="outline" onClick={() => void refresh()} disabled={isBusy}>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
            {message ? (
              <div className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-muted">{message}</div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Release Assets</CardTitle>
            <CardDescription>APK、EXE 和 latest.json 发布资产。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.releases.map((release) => (
                <div key={release.id} className="rounded-lg border border-line bg-white p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-ink">{release.name}</p>
                      <p className="mt-1 text-xs text-muted">{release.tagName} · {formatDate(release.publishedAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {release.prerelease ? <Badge variant="warning">Prerelease</Badge> : <Badge>Stable</Badge>}
                      <a className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-900" href={release.htmlUrl} target="_blank" rel="noreferrer">
                        GitHub
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {release.assets.map((asset) => (
                      <a key={asset.id} href={asset.url} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-canvas px-3 py-2 hover:bg-slate-50">
                        <span className="block truncate text-sm font-medium text-ink">{asset.name}</span>
                        <span className="mt-1 block text-xs text-muted">{formatBytes(asset.size)} · {asset.downloadCount} downloads</span>
                      </a>
                    ))}
                    {release.assets.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-line bg-canvas px-3 py-2 text-sm text-muted">No assets</div>
                    ) : null}
                  </div>
                </div>
              ))}
              {data.releases.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line bg-canvas px-4 py-8 text-center text-sm text-muted">暂无 Release。</div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>回滚与 Web 状态</CardTitle>
            <CardDescription>回滚通过 GitHub Actions dispatch 指定历史 tag。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-line bg-canvas p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Globe2 className="h-4 w-4 text-teal-700" />
                Web Deploy
              </div>
              <p className="mt-2 break-all text-sm text-muted">{manifest.webUrl || "-"}</p>
              {manifest.webUrl ? (
                <a className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-900" href={manifest.webUrl} target="_blank" rel="noreferrer">
                  Open Web
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
            <label className="block">
              <span className="text-sm font-medium text-ink">Rollback version</span>
              <select
                value={rollbackTag}
                onChange={(event) => setRollbackTag(event.target.value)}
                className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
              >
                {data.releases.map((release) => (
                  <option key={release.id} value={release.tagName}>{release.tagName}</option>
                ))}
              </select>
            </label>
            <Button variant="outline" className="w-full" onClick={() => void dispatchWorkflow("rollback")} disabled={isBusy || !rollbackTag}>
              <RotateCcw className="h-4 w-4" />
              Rollback
            </Button>
            <div className="rounded-lg border border-line bg-canvas p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <SlidersHorizontal className="h-4 w-4 text-teal-700" />
                灰度策略
              </div>
              <p className="mt-2 text-sm text-muted">{channelLabels[channel]} · {rollout}% · Force update {forceUpdate ? "on" : "off"}</p>
              <p className="mt-2 text-xs leading-5 text-muted">当前 latest.json：{manifest.channel} · {manifest.rollout}% · Force {manifest.forceUpdate ? "on" : "off"}</p>
            </div>
            <div className="rounded-lg border border-line bg-canvas p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ShieldCheck className="h-4 w-4 text-teal-700" />
                API
              </div>
              <p className="mt-2 break-all text-xs leading-5 text-muted">{data.apiBase}</p>
              <p className="mt-1 break-all text-xs leading-5 text-muted">{data.latestJsonUrl}</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
