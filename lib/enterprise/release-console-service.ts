import "server-only";

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { RbacUser } from "@/lib/auth/rbac";
import {
  git,
  normalizeReleaseArtifact,
  readBuildId,
  readPublicLatestManifest,
  readReleaseManifest,
  resolveReleaseEnvironment
} from "@/lib/enterprise/release-manifest-reader";
import { checkReleaseHealth } from "@/lib/enterprise/release-health-check";
import { readReleaseAuditLog } from "@/lib/enterprise/release-audit-log";
import {
  getGithubActionsState,
  getLatestWorkflowRun,
  getWorkflowUrl,
  listWorkflows
} from "@/lib/enterprise/release-github-actions-client";
import type {
  ReleaseConsoleSummary,
  ReleaseEnvironment,
  ReleaseEnvironmentState,
  ReleaseGithubState,
  ReleaseManifestResponse,
  ReleasePermissions,
  ReleaseRollbackState,
  ReleaseStatus,
  ReleaseUserRole,
  ReleaseWorkflowState,
  RollbackPlanResponse
} from "@/lib/enterprise/release-console-types";

const WORKFLOWS = [
  ["admin-ingest-release.yml", "总发布编排"],
  ["admin-ingest-build-web.yml", "Web 云端构建"],
  ["admin-ingest-deploy-web.yml", "Web 构建 / 部署"],
  ["admin-ingest-build-apk.yml", "APK 构建"],
  ["admin-ingest-build-exe.yml", "EXE 构建"],
  ["admin-ingest-qa.yml", "发布 QA"],
  ["admin-ingest-rollback.yml", "回滚"]
] as const;

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function roleOf(actor: RbacUser | null): ReleaseUserRole {
  const roles = actor
    ? (actor.roles?.map(String) ?? [String(actor.role)])
    : [];

  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("ingest_admin")) return "ingest_admin";
  if (roles.includes("kb_admin")) return "kb_admin";
  if (roles.includes("user")) return "user";

  return "unknown";
}

export function buildReleasePermissions(actor: RbacUser | null): ReleasePermissions {
  const role = roleOf(actor);

  if (role === "super_admin") {
    return {
      role,
      canView: true,
      canPublish: true,
      canRollback: true,
      canViewSecrets: false,
      canCopyRollbackCommand: true,
      canExecuteRollback: true,
      note: "super_admin 可查看全部发布信息，并可触发 GitHub Actions 发布 / 回滚 workflow；不会直接执行 SSH 或 reset。"
    };
  }

  if (role === "ingest_admin") {
    return {
      role,
      canView: true,
      canPublish: true,
      canRollback: false,
      canViewSecrets: false,
      canCopyRollbackCommand: true,
      canExecuteRollback: false,
      note: "ingest_admin 可查看发布状态，可触发 dev / staging 发布；不可触发生产回滚。"
    };
  }

  if (role === "kb_admin") {
    return {
      role,
      canView: true,
      canPublish: false,
      canRollback: false,
      canViewSecrets: false,
      canCopyRollbackCommand: false,
      canExecuteRollback: false,
      note: "kb_admin 只读发布状态。"
    };
  }

  return {
    role,
    canView: false,
    canPublish: false,
    canRollback: false,
    canViewSecrets: false,
    canCopyRollbackCommand: false,
    canExecuteRollback: false,
    note: "当前账号不可访问发布中心。"
  };
}

function workflowStatusFromRun(input: {
  exists: boolean;
  status?: string | null;
  conclusion?: string | null;
}): ReleaseStatus {
  if (!input.exists) {
    return "error";
  }

  if (!input.status && !input.conclusion) {
    return "unknown";
  }

  if (input.status && ["queued", "in_progress", "requested", "waiting", "pending"].includes(input.status)) {
    return "warning";
  }

  if (input.conclusion === "success") {
    return "success";
  }

  if (input.conclusion && ["failure", "timed_out", "cancelled", "startup_failure", "action_required"].includes(input.conclusion)) {
    return "error";
  }

  return "unknown";
}

export async function buildReleaseWorkflowStates(): Promise<{
  github: ReleaseGithubState;
  workflows: ReleaseWorkflowState[];
  diagnostics: string[];
}> {
  const github = getGithubActionsState();
  const githubWorkflows = await listWorkflows();
  const workflowFiles = new Set(
    githubWorkflows.workflows
      .map((workflow) => readString((workflow as Record<string, unknown>).path)?.replace(/^\.github\/workflows\//, ""))
      .filter((file): file is string => Boolean(file))
  );
  const diagnostics = [
    github.available ? "githubActions:configured" : `githubActions:${github.reason ?? "unavailable"}`
  ];

  const workflows = await Promise.all(WORKFLOWS.map(async ([file, name]) => {
    const exists = existsSync(resolve(process.cwd(), ".github/workflows", file));
    const latestRun = github.available ? await getLatestWorkflowRun(file) : null;
    const run = latestRun?.run ?? null;
    const githubWorkflowExists = github.available ? workflowFiles.has(file) : false;

    return {
      file,
      name,
      exists,
      recentStatus: workflowStatusFromRun({
        exists,
        status: run?.status,
        conclusion: run?.conclusion
      }),
      triggerHint: exists
        ? github.available
          ? "GitHub Actions 可读取；支持 workflow_dispatch 手动触发。"
          : "GitHub Actions Token 未配置，当前仅显示本地 workflow 文件状态。"
        : "workflow 文件不存在。",
      runId: run?.runId ?? null,
      branch: run?.branch ?? null,
      tag: run?.tag ?? null,
      commit: run?.commit ?? null,
      conclusion: run?.conclusion ?? run?.status ?? null,
      startedAt: run?.startedAt ?? null,
      updatedAt: run?.updatedAt ?? null,
      htmlUrl: run?.htmlUrl ?? null,
      workflowUrl: getWorkflowUrl(file),
      canDispatch: Boolean(exists && (!github.available || githubWorkflowExists)),
      reason: github.available ? latestRun?.reason ?? null : github.reason
    };
  }));

  return {
    github,
    workflows,
    diagnostics
  };
}

function releaseTags() {
  return (git(["tag", "--list", "release/admin-ingest-*", "--sort=-creatordate"], "") ?? "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function backupBranches() {
  return (git(["branch", "--list", "backup/admin-ingest-*"], "") ?? "")
    .split(/\r?\n/)
    .map((value) => value.replace(/^\*\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function rollbackState(): ReleaseRollbackState {
  return {
    workflowExists: existsSync(resolve(process.cwd(), ".github/workflows/admin-ingest-rollback.yml")),
    scriptExists: existsSync(resolve(process.cwd(), "scripts/rollback/rollback-admin-ingest.sh")),
    releaseTags: releaseTags(),
    backupBranches: backupBranches(),
    warning: "回滚会影响线上版本，请确认 release tag 后手动执行。"
  };
}

function environmentStates(input: {
  environment: ReleaseEnvironment;
  releaseHead: string | null;
  deployedAt: string | null;
  prodHealth: ReleaseStatus;
}): ReleaseEnvironmentState[] {
  return [
    {
      key: "dev",
      label: "dev",
      webUrl: "http://localhost:3063/admin-ingest?app=ingest-admin&platform=web",
      apiHealth: input.environment === "dev" ? input.prodHealth : "unknown",
      deployStatus: "unknown",
      currentHead: input.environment === "dev" ? input.releaseHead : null,
      releaseTag: null,
      systemLinked: "unknown",
      lastDeployTime: null,
      note: "本地 QA 环境"
    },
    {
      key: "staging",
      label: "staging",
      webUrl: null,
      apiHealth: "unknown",
      deployStatus: "unknown",
      currentHead: null,
      releaseTag: null,
      systemLinked: "unknown",
      lastDeployTime: null,
      note: "未配置"
    },
    {
      key: "prod",
      label: "prod",
      webUrl: "http://47.238.0.23/admin-ingest?app=ingest-admin&platform=web",
      apiHealth: input.environment === "prod" ? input.prodHealth : "unknown",
      deployStatus: input.environment === "prod" ? "unknown" : "unknown",
      currentHead: input.environment === "prod" ? input.releaseHead : null,
      releaseTag: null,
      systemLinked: input.environment === "prod" ? input.prodHealth : "unknown",
      lastDeployTime: input.deployedAt,
      note: "阿里云生产环境"
    }
  ];
}

export async function buildReleaseConsoleSummary(input: {
  actor: RbacUser | null;
  requestUrl: string;
  cookieHeader?: string | null;
}): Promise<ReleaseConsoleSummary> {
  const manifest = readReleaseManifest();
  const publicLatest = readPublicLatestManifest();
  const currentHead = git(["rev-parse", "HEAD"]);
  const releaseHead = readString(manifest?.releaseHead) ?? readString(manifest?.commit) ?? currentHead;
  const releaseTag = readString(manifest?.releaseTag) ?? readString(manifest?.tag);
  const version = readString(manifest?.version) ?? readString(publicLatest?.version);
  const buildNumber = readString(manifest?.buildNumber) ?? readString(publicLatest?.buildNumber);
  const environment = resolveReleaseEnvironment(readString(manifest?.environment));
  const buildId = readBuildId() ?? readString(manifest?.buildId);
  const web = normalizeReleaseArtifact("web", readObject(manifest?.web), releaseHead);
  const apk = normalizeReleaseArtifact("apk", readObject(manifest?.apk), releaseHead);
  const exe = normalizeReleaseArtifact("exe", readObject(manifest?.exe), releaseHead);
  const cookieHeader = input.cookieHeader ?? "";
  const origin = new URL(input.requestUrl).origin;
  const baseUrl = environment === "prod" ? "http://47.238.0.23" : origin;
  const health = await checkReleaseHealth(baseUrl, cookieHeader);
  const healthStatus = health.some((item) => item.ok) ? "success" : "unknown";
  const systemLinked = health.some((item) => item.key === "expert-market" && item.ok) ? "success" : healthStatus;
  const webMatches = Boolean(releaseHead && web.available && web.head === releaseHead);
  const apkMatches = apk.available ? apk.head === releaseHead : null;
  const exeMatches = exe.available ? exe.head === releaseHead : null;
  const webApkExeSync = Boolean(webMatches && (apkMatches !== false) && (exeMatches !== false));
  const deployedAt = readString(manifest?.buildTime) ?? readString(publicLatest?.generatedAt);
  const workflowState = await buildReleaseWorkflowStates();

  return {
    ok: true,
    releaseHead,
    releaseTag,
    version,
    buildNumber,
    buildId,
    systemLinked,
    environment,
    latestStatus: web.available ? "success" : "warning",
    deployedBy: readString(manifest?.deployedBy) ?? "unknown",
    deployedAt,
    web,
    apk,
    exe,
    sync: {
      releaseHead,
      webMatches,
      apkMatches,
      exeMatches,
      webApkExeSync
    },
    workflows: workflowState.workflows,
    environments: environmentStates({
      environment,
      releaseHead,
      deployedAt,
      prodHealth: healthStatus
    }),
    health,
    rollback: rollbackState(),
    permissions: buildReleasePermissions(input.actor),
    github: workflowState.github,
    audit: readReleaseAuditLog(),
    diagnostics: [
      manifest ? "releaseManifest:found" : "releaseManifest:missing",
      publicLatest ? "publicLatest:found" : "publicLatest:missing",
      buildId ? "buildId:found" : "buildId:missing",
      ...workflowState.diagnostics
    ]
  };
}

export function buildReleaseManifestResponse(): ReleaseManifestResponse {
  const manifest = readReleaseManifest();
  const publicLatest = readPublicLatestManifest();
  const buildId = readBuildId();
  const gitHead = git(["rev-parse", "HEAD"]);

  return {
    ok: true,
    manifest: manifest ?? {
      app: "admin-ingest",
      available: false,
      reason: "RELEASE_MANIFEST_NOT_FOUND"
    },
    publicLatest,
    buildId,
    gitHead,
    diagnostics: [
      manifest ? "releaseManifest:found" : "releaseManifest:missing",
      publicLatest ? "publicLatest:found" : "publicLatest:missing",
      buildId ? "buildId:found" : "buildId:missing",
      gitHead ? "gitHead:found" : "gitHead:missing"
    ]
  };
}

export function buildRollbackPlan(targetTag: string): RollbackPlanResponse {
  const safeTarget = targetTag.trim();

  if (!safeTarget) {
    throw new Error("ROLLBACK_TARGET_TAG_REQUIRED");
  }

  if (!safeTarget.startsWith("release/admin-ingest-") && !safeTarget.startsWith("backup/admin-ingest-")) {
    throw new Error("ROLLBACK_TARGET_TAG_UNSAFE");
  }

  return {
    ok: true,
    targetTag: safeTarget,
    commands: [
      `gh workflow run admin-ingest-rollback.yml --ref main -f rollbackRef=${safeTarget} -f environment=prod -f confirmText=CONFIRM_ROLLBACK -f deploy=false`,
      "在 GitHub Actions 中确认 rollback workflow 日志，再按发布流程进行人工部署确认。"
    ],
    warning: "回滚会影响线上版本，请确认 release tag 后手动执行。本 API 只生成命令草稿，不执行回滚。"
  };
}
