import "server-only";

type GithubConfig =
  | {
      available: true;
      owner: string;
      repo: string;
      repository: string;
      token: string;
      reason: null;
    }
  | {
      available: false;
      owner: null;
      repo: null;
      repository: string | null;
      token: null;
      reason: string;
    };

export type GithubWorkflowRun = {
  runId: number | null;
  branch: string | null;
  tag: string | null;
  commit: string | null;
  status: string | null;
  conclusion: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  htmlUrl: string | null;
};

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveGithubConfig(): GithubConfig {
  const token = readString(process.env.GITHUB_TOKEN);
  const repositoryFromEnv = readString(process.env.GITHUB_REPOSITORY);
  const owner = readString(process.env.GITHUB_OWNER);
  const repo = readString(process.env.GITHUB_REPO);
  const repository = repositoryFromEnv ?? (owner && repo ? `${owner}/${repo}` : null);

  if (!token) {
    return {
      available: false,
      owner: null,
      repo: null,
      repository,
      token: null,
      reason: "GITHUB_TOKEN_NOT_CONFIGURED"
    };
  }

  if (!repository) {
    return {
      available: false,
      owner: null,
      repo: null,
      repository: null,
      token: null,
      reason: "GITHUB_REPOSITORY_NOT_CONFIGURED"
    };
  }

  const [resolvedOwner, resolvedRepo] = repository.split("/");

  if (!resolvedOwner || !resolvedRepo) {
    return {
      available: false,
      owner: null,
      repo: null,
      repository,
      token: null,
      reason: "GITHUB_REPOSITORY_INVALID"
    };
  }

  return {
    available: true,
    owner: resolvedOwner,
    repo: resolvedRepo,
    repository,
    token,
    reason: null
  };
}

function getApiBase(config: Extract<GithubConfig, { available: true }>) {
  return `https://api.github.com/repos/${config.owner}/${config.repo}`;
}

async function githubRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; reason: string }> {
  const config = resolveGithubConfig();

  if (!config.available) {
    return {
      ok: false,
      status: 0,
      reason: config.reason
    };
  }

  const response = await fetch(`${getApiBase(config)}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      "User-Agent": "ai-knowledge-admin-ingest-release-console",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: `GITHUB_API_${response.status}`
    };
  }

  if (response.status === 204) {
    return { ok: true, data: null as T };
  }

  return {
    ok: true,
    data: await response.json() as T
  };
}

function normalizeRun(value: unknown): GithubWorkflowRun | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const run = value as Record<string, unknown>;
  const runId = typeof run.id === "number" ? run.id : null;
  const headBranch = readString(run.head_branch);
  const event = readString(run.event);

  return {
    runId,
    branch: headBranch,
    tag: event === "push" && headBranch?.startsWith("release/") ? headBranch : null,
    commit: readString(run.head_sha),
    status: readString(run.status),
    conclusion: readString(run.conclusion),
    startedAt: readString(run.run_started_at) ?? readString(run.created_at),
    updatedAt: readString(run.updated_at),
    htmlUrl: readString(run.html_url)
  };
}

export function getGithubActionsState() {
  const config = resolveGithubConfig();

  return {
    available: config.available,
    reason: config.reason,
    repository: config.repository,
    workflowsUrl: config.repository ? `https://github.com/${config.repository}/actions` : null
  };
}

export function getWorkflowUrl(workflowFile: string) {
  const config = resolveGithubConfig();

  if (!config.repository) {
    return null;
  }

  return `https://github.com/${config.repository}/actions/workflows/${workflowFile}`;
}

export async function listWorkflows() {
  const state = getGithubActionsState();

  if (!state.available) {
    return {
      available: false as const,
      reason: state.reason ?? "GITHUB_TOKEN_NOT_CONFIGURED",
      workflows: [] as Array<Record<string, unknown>>
    };
  }

  const result = await githubRequest<{ workflows?: Array<Record<string, unknown>> }>("/actions/workflows?per_page=100");

  if (!result.ok) {
    return {
      available: false as const,
      reason: result.reason,
      workflows: [] as Array<Record<string, unknown>>
    };
  }

  return {
    available: true as const,
    reason: null,
    workflows: Array.isArray(result.data.workflows) ? result.data.workflows : []
  };
}

export async function listWorkflowRuns(workflowFile: string) {
  const result = await githubRequest<{ workflow_runs?: unknown[] }>(
    `/actions/workflows/${encodeURIComponent(workflowFile)}/runs?per_page=5`
  );

  if (!result.ok) {
    return {
      available: false as const,
      reason: result.reason,
      runs: [] as GithubWorkflowRun[]
    };
  }

  return {
    available: true as const,
    reason: null,
    runs: (Array.isArray(result.data.workflow_runs) ? result.data.workflow_runs : [])
      .map(normalizeRun)
      .filter((run): run is GithubWorkflowRun => Boolean(run))
  };
}

export async function getLatestWorkflowRun(workflowFile: string) {
  const result = await listWorkflowRuns(workflowFile);

  return {
    ...result,
    run: result.runs[0] ?? null
  };
}

export async function dispatchWorkflow(
  workflowFile: string,
  payload: {
    ref: string;
    inputs?: Record<string, string>;
  }
) {
  const result = await githubRequest<null>(`/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`, {
    method: "POST",
    body: JSON.stringify({
      ref: payload.ref,
      inputs: payload.inputs ?? {}
    })
  });

  if (!result.ok) {
    return {
      available: false as const,
      dispatched: false,
      reason: result.reason,
      runUrl: null
    };
  }

  return {
    available: true as const,
    dispatched: true,
    reason: null,
    runUrl: getWorkflowUrl(workflowFile)
  };
}
