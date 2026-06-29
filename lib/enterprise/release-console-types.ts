export type ReleaseEnvironment = "dev" | "staging" | "prod";
export type ReleaseStatus = "success" | "warning" | "error" | "unknown";
export type ReleaseUserRole = "super_admin" | "ingest_admin" | "kb_admin" | "user" | "unknown";

export type ReleaseArtifact = {
  platform: "web" | "apk" | "exe";
  available: boolean;
  head: string | null;
  path: string | null;
  url?: string | null;
  buildId?: string | null;
  size?: number | null;
  sha256?: string | null;
  reason?: string | null;
  buildTime?: string | null;
  tag?: string | null;
};

export type ReleaseWorkflowState = {
  file: string;
  name: string;
  exists: boolean;
  recentStatus: ReleaseStatus;
  triggerHint: string;
};

export type ReleaseEnvironmentState = {
  key: ReleaseEnvironment;
  label: string;
  webUrl: string | null;
  apiHealth: ReleaseStatus;
  deployStatus: ReleaseStatus;
  currentHead: string | null;
  lastDeployTime: string | null;
  note?: string;
};

export type ReleaseHealthTarget = {
  key: string;
  path: string;
  status: number | "error" | "unknown";
  ok: boolean;
  message?: string;
};

export type ReleaseRollbackState = {
  workflowExists: boolean;
  scriptExists: boolean;
  releaseTags: string[];
  backupBranches: string[];
  warning: string;
};

export type ReleasePermissions = {
  role: ReleaseUserRole;
  canView: boolean;
  canCopyRollbackCommand: boolean;
  canExecuteRollback: boolean;
  note: string;
};

export type ReleaseConsoleSummary = {
  ok: true;
  releaseHead: string | null;
  releaseTag: string | null;
  buildId: string | null;
  systemLinked: ReleaseStatus;
  environment: ReleaseEnvironment;
  latestStatus: ReleaseStatus;
  deployedBy: string;
  deployedAt: string | null;
  web: ReleaseArtifact;
  apk: ReleaseArtifact;
  exe: ReleaseArtifact;
  sync: {
    releaseHead: string | null;
    webMatches: boolean;
    apkMatches: boolean | null;
    exeMatches: boolean | null;
    webApkExeSync: boolean;
  };
  workflows: ReleaseWorkflowState[];
  environments: ReleaseEnvironmentState[];
  health: ReleaseHealthTarget[];
  rollback: ReleaseRollbackState;
  permissions: ReleasePermissions;
  diagnostics: string[];
};

export type ReleaseManifestResponse = {
  ok: true;
  manifest: Record<string, unknown>;
  publicLatest: Record<string, unknown> | null;
  buildId: string | null;
  gitHead: string | null;
  diagnostics: string[];
};

export type RollbackPlanResponse = {
  ok: true;
  targetTag: string;
  commands: string[];
  warning: string;
};
