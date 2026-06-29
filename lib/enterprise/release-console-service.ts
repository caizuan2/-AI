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
import type {
  ReleaseConsoleSummary,
  ReleaseEnvironment,
  ReleaseEnvironmentState,
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
      canCopyRollbackCommand: true,
      canExecuteRollback: false,
      note: "super_admin 可查看全部发布信息；本控制台仍不执行生产回滚。"
    };
  }

  if (role === "ingest_admin") {
    return {
      role,
      canView: true,
      canCopyRollbackCommand: true,
      canExecuteRollback: false,
      note: "ingest_admin 可查看发布状态并复制回滚指令，不可直接执行生产回滚。"
    };
  }

  if (role === "kb_admin") {
    return {
      role,
      canView: true,
      canCopyRollbackCommand: false,
      canExecuteRollback: false,
      note: "kb_admin 只读发布状态。"
    };
  }

  return {
    role,
    canView: false,
    canCopyRollbackCommand: false,
    canExecuteRollback: false,
    note: "当前账号不可访问发布中心。"
  };
}

function workflowStates(): ReleaseWorkflowState[] {
  return WORKFLOWS.map(([file, name]) => {
    const exists = existsSync(resolve(process.cwd(), ".github/workflows", file));

    return {
      file,
      name,
      exists,
      recentStatus: exists ? "unknown" : "error",
      triggerHint: exists ? "GitHub Actions 支持 workflow_dispatch 手动触发。" : "workflow 文件不存在。"
    };
  });
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
  const webMatches = Boolean(releaseHead && web.available && web.head === releaseHead);
  const apkMatches = apk.available ? apk.head === releaseHead : null;
  const exeMatches = exe.available ? exe.head === releaseHead : null;
  const webApkExeSync = Boolean(webMatches && (apkMatches !== false) && (exeMatches !== false));
  const deployedAt = readString(manifest?.buildTime) ?? readString(publicLatest?.generatedAt);

  return {
    ok: true,
    releaseHead,
    releaseTag,
    buildId,
    systemLinked: "unknown",
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
    workflows: workflowStates(),
    environments: environmentStates({
      environment,
      releaseHead,
      deployedAt,
      prodHealth: healthStatus
    }),
    health,
    rollback: rollbackState(),
    permissions: buildReleasePermissions(input.actor),
    diagnostics: [
      manifest ? "releaseManifest:found" : "releaseManifest:missing",
      publicLatest ? "publicLatest:found" : "publicLatest:missing",
      buildId ? "buildId:found" : "buildId:missing"
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
      "git checkout main",
      `git reset --hard ${safeTarget}`,
      "npm install --include=dev",
      "npm run build",
      "pm2 restart ai-knowledge-main"
    ],
    warning: "回滚会影响线上版本，请确认 release tag 后手动执行。本 API 只生成命令草稿，不执行回滚。"
  };
}
