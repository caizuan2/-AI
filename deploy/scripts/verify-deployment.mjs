import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");
const failures = [];
const bashExecutable = process.platform === "win32"
  ? [
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe"),
      path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Git", "bin", "bash.exe"),
    ].find((candidate) => fs.existsSync(candidate)) ?? "bash"
  : "bash";

function fail(message) {
  failures.push(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`missing required deployment asset: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

const inheritedEnvironmentProbes = [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "COMPOSE_FILE",
  "GIT_CONFIG_COUNT",
  "NODE_OPTIONS",
  "NODE_PATH",
  "BASH_ENV",
  "ENV",
  "APT_CONFIG",
];

function runCleanEnvironmentProbe(relativePath, inheritedName, preSetMarker) {
  const command = [
    "exec /usr/bin/env -i",
    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "HOME=/root LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC",
    preSetMarker ? "AI_TEAM_OS_CLEAN_ENVIRONMENT=1" : "",
    `${inheritedName}=contamination-probe`,
    '/usr/bin/bash --noprofile --norc "$1" --help',
  ].filter(Boolean).join(" ");
  return spawnSync(bashExecutable, ["-c", command, "environment-probe", relativePath], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function verifyCleanEnvironmentContract(name, relativePath, source) {
  expect(
    source.includes("SAFE_PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"),
    `${name} must pin the root execution PATH`,
  );
  expect(
    source.includes('exec /usr/bin/env "${CLEAN_ENV[@]}" /usr/bin/bash --noprofile --norc "$0" "$@"'),
    `${name} must re-exec from an explicit env -i allowlist before using host tools`,
  );
  expect(/validate_clean_environment/u.test(source), `${name} must validate the re-exec marker environment before trusting it`);

  for (const inheritedName of inheritedEnvironmentProbes) {
    const cleanedProbe = runCleanEnvironmentProbe(relativePath, inheritedName, false);
    expect(
      cleanedProbe.status === 0 && /Usage:/u.test(cleanedProbe.stdout ?? ""),
      `${name} must clear inherited ${inheritedName} during its normal clean re-exec`,
    );
    const forgedProbe = runCleanEnvironmentProbe(relativePath, inheritedName, true);
    expect(
      forgedProbe.status === 1 && /forged or contaminated clean-environment marker/u.test(forgedProbe.stderr ?? ""),
      `${name} must reject a pre-set clean marker combined with inherited ${inheritedName}`,
    );
  }
}

function orchestratorV2Includes(source, relativePath) {
  const match = source.match(/^ORCHESTRATOR_V2_RELATIVE_FILES=\(\r?\n([\s\S]*?)^\)$/mu);
  if (!match) return false;
  return match[1]
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .includes(relativePath);
}

function parseEnvTemplate(source) {
  const values = new Map();
  for (const originalLine of source.split(/\r?\n/u)) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u);
    if (!match) {
      fail(`invalid .env.production.template line: ${originalLine}`);
      continue;
    }
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function composeServiceBlocks(source) {
  const blocks = new Map();
  const lines = source.split(/\r?\n/u);
  let insideServices = false;
  let currentName = null;
  let currentLines = [];

  const flush = () => {
    if (currentName) blocks.set(currentName, currentLines.join("\n"));
    currentName = null;
    currentLines = [];
  };

  for (const line of lines) {
    if (line === "services:") {
      insideServices = true;
      continue;
    }
    if (insideServices && /^[A-Za-z][A-Za-z0-9_-]*:$/u.test(line)) {
      flush();
      break;
    }
    if (!insideServices) continue;
    const service = line.match(/^  ([a-z][a-z0-9_-]*):\s*$/u);
    if (service) {
      flush();
      currentName = service[1];
      currentLines.push(line);
    } else if (currentName) {
      currentLines.push(line);
    }
  }
  flush();
  return blocks;
}

const requiredAssets = [
  ".env.production.template",
  "deploy/app-production.env.template",
  "deploy/VERSION_CHECK.json",
  "deploy/docker/Dockerfile.production",
  "deploy/docker/docker-compose.yml",
  "deploy/nginx/ai-team-os.conf",
  "deploy/scripts/deploy.sh",
  "deploy/scripts/backup.sh",
  "deploy/scripts/rollback.sh",
  "deploy/scripts/server-init.sh",
  "deploy/scripts/cloud-preflight-check.sh",
  "deploy/scripts/production-health-check.sh",
  "deploy/scripts/load-env.sh",
  "deploy/scripts/test-env-loader.sh",
  "deploy/scripts/verify-team-os-schema.mjs",
  "deploy/README.md",
  "deploy/DATABASE_MIGRATION.md",
  "deploy/DOMAIN_SSL_SETUP.md",
  "deploy/ENTERPRISE_ONBOARDING.md",
  "deploy/PILOT_COMPANY_TEST.md",
  "deploy/SECURITY_CHECKLIST.md",
  "deploy/APP_RELEASE_READINESS.md",
  "docs/cloud/ALIYUN_DEPLOYMENT.md",
  "docs/cloud/ALIYUN_EXECUTION_GUIDE.md",
  "docs/cloud/PRODUCTION_COMMANDS.md",
  "docs/cloud/DATABASE_RELEASE.md",
  "docs/cloud/HTTPS_SETUP.md",
  "docs/cloud/DOMAIN_SSL_PRODUCTION.md",
  "docs/cloud/PRODUCTION_DATABASE.md",
  "docs/cloud/PILOT_TEST_PLAN.md",
];
for (const asset of requiredAssets) {
  expect(fs.existsSync(path.join(repositoryRoot, asset)), `missing required deployment asset: ${asset}`);
}

const versionSource = read("deploy/VERSION_CHECK.json");
if (versionSource) {
  try {
    const manifest = JSON.parse(versionSource);
    expect(manifest.schemaVersion === 1, "VERSION_CHECK schemaVersion must be 1");
    expect(manifest.product === "AI Team OS", "VERSION_CHECK product must be AI Team OS");
    expect(manifest.web?.version === "1.0.0", "VERSION_CHECK web version must be 1.0.0");
    expect(manifest.web?.buildNumber === "2026071301", "VERSION_CHECK web build must be 2026071301");
    expect(
      JSON.stringify(Object.keys(manifest.platforms ?? {}).sort()) === JSON.stringify(["android", "macos", "windows"]),
      "VERSION_CHECK must define exactly android, windows, and macos"
    );
    for (const platform of ["android", "windows", "macos"]) {
      const entry = manifest.platforms?.[platform];
      expect(Boolean(entry), `VERSION_CHECK must define ${platform}`);
      if (!entry) continue;
      expect(entry.releaseStatus === "unpublished", `${platform} must remain unpublished until a signed artifact exists`);
      expect(entry.forceUpdate === false, `${platform} forceUpdate must remain false before publication`);
      expect(entry.downloadUrl === null, `${platform} downloadUrl must remain null before publication`);
      expect(Number.isInteger(entry.latestBuild), `${platform} latestBuild must be an integer`);
      expect(Number.isInteger(entry.minimumBuild), `${platform} minimumBuild must be an integer`);
      expect(entry.latestBuild >= 1 && entry.minimumBuild >= 1, `${platform} build numbers must be positive`);
      expect(entry.minimumBuild <= entry.latestBuild, `${platform} minimumBuild cannot exceed latestBuild`);
      expect(Array.isArray(entry.releaseNotes) && entry.releaseNotes.length > 0, `${platform} must include release notes`);
    }
  } catch (error) {
    fail(`VERSION_CHECK.json is not valid JSON: ${error.message}`);
  }
}

const environmentSource = read(".env.production.template");
const environment = parseEnvTemplate(environmentSource);
const requiredEnvironmentKeys = [
  "DATABASE_CA_CERT",
  "DATABASE_URL",
  "DIRECT_URL",
  "BACKUP_DATABASE_URL",
  "REDIS_URL",
  "NEXT_PUBLIC_APP_URL",
  "APP_URL",
  "SESSION_SECRET",
  "ENCRYPTION_KEY",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "QWEN_API_KEY",
  "AI_PROVIDER",
  "TEAM_OS_BIND_ADDRESS",
  "TEAM_OS_PORT",
  "DEPLOY_SOURCE_MODE",
  "DEPLOY_RELEASE_SHA",
  "DEPLOY_SOURCE_ARCHIVE_SHA256",
  "DEPLOY_BASE_DIR",
  "DEPLOY_STATE_DIR",
  "DEPLOY_BACKUP_DIR",
  "DEPLOY_LOCK_FILE",
  "BACKUP_LOCK_FILE",
  "BACKUP_ENCRYPTION_CERT",
  "TEAM_OS_HEALTH_URL",
  "TEAM_OS_READINESS_URL",
];
for (const key of requiredEnvironmentKeys) {
  expect(environment.has(key), `.env.production.template is missing ${key}`);
}
expect(environment.get("TEAM_OS_BIND_ADDRESS") === "127.0.0.1", "TEAM_OS_BIND_ADDRESS must default to loopback");
expect(environment.get("TEAM_OS_PORT") === "3022", "TEAM_OS_PORT must default to 3022");
expect(environment.get("DEPLOY_LOCK_FILE") === "/run/ai-team-os/deploy.lock", "DEPLOY_LOCK_FILE must use a dedicated root-managed lock directory");
expect(environment.get("BACKUP_LOCK_FILE") === "/run/ai-team-os/backup.lock", "BACKUP_LOCK_FILE must use a dedicated root-managed lock directory");
expect(environment.get("DATABASE_CA_CERT") === "/etc/ai-team-os/rds-ca.pem", "DATABASE_CA_CERT must use the fixed container-visible CA path");
expect(environment.get("BACKUP_ENCRYPTION_CERT") === "/etc/ai-team-os/backup-encryption-cert.pem", "BACKUP_ENCRYPTION_CERT must use the fixed public-certificate path");
expect(environment.get("APP_URL") !== environment.get("NEXT_PUBLIC_APP_URL"), "APP_URL must use a separate trusted knowledge-service origin");
expect(!(environment.get("BACKUP_DATABASE_URL") ?? "").includes("schema="), "BACKUP_DATABASE_URL must be a libpq URL without Prisma schema parameters");
for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  const url = new URL(environment.get(key));
  expect(url.searchParams.get("sslmode") === "require", `${key} must use Prisma sslmode=require`);
  expect(url.searchParams.get("sslaccept") === "strict", `${key} must reject an untrusted server certificate`);
  expect(url.searchParams.get("sslrootcert") === environment.get("DATABASE_CA_CERT"), `${key} must pin DATABASE_CA_CERT`);
}
const backupDatabaseUrl = new URL(environment.get("BACKUP_DATABASE_URL"));
expect(backupDatabaseUrl.searchParams.get("sslmode") === "verify-full", "BACKUP_DATABASE_URL must verify the RDS CA and hostname");
expect(backupDatabaseUrl.searchParams.get("sslrootcert") === environment.get("DATABASE_CA_CERT"), "BACKUP_DATABASE_URL must pin DATABASE_CA_CERT");

const highConfidenceSecretPatterns = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\bLTAI[A-Za-z0-9]{12,}\b/u,
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/u,
];
for (const pattern of highConfidenceSecretPatterns) {
  expect(!pattern.test(environmentSource), `.env.production.template contains a value that resembles a real secret (${pattern})`);
}
for (const key of [
  "SESSION_SECRET",
  "ENCRYPTION_KEY",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "QWEN_API_KEY",
]) {
  const value = environment.get(key) ?? "";
  expect(value === "" || /replace|example|placeholder|change|your|<|>/iu.test(value), `${key} must be empty or an obvious placeholder`);
}

const appEnvironmentSource = read("deploy/app-production.env.template");
const appEnvironment = parseEnvTemplate(appEnvironmentSource);
expect(
  JSON.stringify([...appEnvironment.keys()].sort()) ===
    JSON.stringify(["TEAM_OS_ALLOW_INSECURE_LOCAL", "TEAM_OS_BASE_URL"]),
  "APP production template must contain only the public Team OS URL and insecure-local guard"
);
expect(/^https:\/\/[^/]+$/u.test(appEnvironment.get("TEAM_OS_BASE_URL") ?? ""), "APP production URL must be an HTTPS origin");
expect(appEnvironment.get("TEAM_OS_ALLOW_INSECURE_LOCAL") === "false", "APP production template must disable insecure local origins");
for (const pattern of highConfidenceSecretPatterns) {
  expect(!pattern.test(appEnvironmentSource), `APP production template contains a value that resembles a real secret (${pattern})`);
}

const dockerfile = read("deploy/docker/Dockerfile.production");
expect(/^# syntax=docker\/dockerfile:[^\s]+@sha256:[0-9a-f]{64}/u.test(dockerfile), "Dockerfile frontend must be digest pinned");
expect(/ARG NODE_IMAGE=node:[^\s]+@sha256:[0-9a-f]{64}/u.test(dockerfile), "Dockerfile Node base must be digest pinned");
expect(/ARG PNPM_VERSION=10\.12\.4/u.test(dockerfile), "Dockerfile must pin pnpm 10.12.4");
expect(/npm install --global --ignore-scripts "pnpm@\$\{PNPM_VERSION\}"/u.test(dockerfile), "Dockerfile must install pinned pnpm without relying on bundled Corepack keys");
expect(/pnpm install --frozen-lockfile/u.test(dockerfile), "Dockerfile must use the frozen pnpm lockfile");
expect(/COPY package\.json pnpm-lock\.yaml pnpm-workspace\.yaml/u.test(dockerfile), "Dockerfile must include the pnpm workspace policy");
expect(/ARG NEXT_PUBLIC_APP_URL=/u.test(dockerfile), "Dockerfile must accept the public Team OS origin as a non-secret build argument");
expect(/FROM dependencies AS migration/u.test(dockerfile), "Dockerfile must expose a one-shot migration target");
expect(/COPY deploy\/scripts\/verify-team-os-schema\.mjs/u.test(dockerfile), "migration image must include the Team OS schema verifier");
expect(/FROM base AS runtime/u.test(dockerfile), "Dockerfile must expose a runtime target");
expect((dockerfile.match(/USER node/gu) ?? []).length >= 2, "runtime and migration targets must run as non-root node");
expect(/CMD \["node", "node_modules\/next\/dist\/bin\/next", "start"\]/u.test(dockerfile), "runtime must start Next directly without a writable Corepack cache");
expect(/ENTRYPOINT \["node", "node_modules\/prisma\/build\/index\.js"\]/u.test(dockerfile), "migration must start Prisma directly without a writable Corepack cache");

const compose = read("deploy/docker/docker-compose.yml");
const serviceBlocks = composeServiceBlocks(compose);
for (const serviceName of ["team-os", "migrate", "postgres", "redis"]) {
  expect(serviceBlocks.has(serviceName), `Compose must define ${serviceName}`);
}
const teamBlock = serviceBlocks.get("team-os") ?? "";
const migrateBlock = serviceBlocks.get("migrate") ?? "";
const postgresBlock = serviceBlocks.get("postgres") ?? "";
const redisBlock = serviceBlocks.get("redis") ?? "";
expect(/127\.0\.0\.1\}:\$\{TEAM_OS_PORT:-3022\}:3000/u.test(teamBlock), "team-os must bind loopback port 3022 by default");
expect(/target: runtime/u.test(teamBlock), "team-os must build the runtime target");
expect(/read_only: true/u.test(teamBlock) && /cap_drop:\s*\n\s*- ALL/u.test(teamBlock), "team-os must use a read-only, capability-dropped container");
expect(/WEB_RELEASE_SHA: \$\{WEB_RELEASE_SHA:-unreleased\}/u.test(teamBlock), "team-os runtime must expose the exact release SHA");
expect(/CHAT_AVATAR_UPLOAD_DIR: \/app\/public\/uploads/u.test(teamBlock), "team-os must route avatar writes to the persistent upload volume");
expect(
  /\/app\/\.next\/cache:size=128m,uid=1000,gid=1000,mode=0750/u.test(teamBlock),
  "team-os must provide a bounded writable Next.js cache tmpfs"
);
expect(!/env_file:/u.test(teamBlock), "team-os must use an explicit runtime environment allowlist");
for (const [name, block] of [["team-os", teamBlock], ["migrate", migrateBlock]]) {
  expect(/source: \$\{DATABASE_CA_CERT:-\/etc\/ai-team-os\/rds-ca\.pem\}/u.test(block), `${name} must bind the fixed host RDS CA`);
  expect(/target: \/etc\/ai-team-os\/rds-ca\.pem/u.test(block) && /create_host_path: false/u.test(block), `${name} must mount the RDS CA read-only without creating a missing host path`);
}
for (const forbiddenRuntimeSecret of ["DIRECT_URL", "BACKUP_DATABASE_URL", "POSTGRES_PASSWORD", "REDIS_PASSWORD"]) {
  expect(!teamBlock.includes(forbiddenRuntimeSecret), `team-os runtime must not receive ${forbiddenRuntimeSecret}`);
}
expect(/public_egress:\s*\n\s*gw_priority: 1/u.test(teamBlock), "team-os must select the egress network as its default gateway");
expect(/profiles: \["tools"\]/u.test(migrateBlock) && /target: migration/u.test(migrateBlock), "migrate must be isolated behind the tools profile");
expect(/profiles: \["database"\]/u.test(postgresBlock), "postgres must be opt-in through the database profile");
expect(/profiles: \["cache"\]/u.test(redisBlock), "redis must be opt-in through the cache profile");
expect(/pgvector\/pgvector@sha256:[0-9a-f]{64}/u.test(postgresBlock), "optional PostgreSQL image must be digest pinned");
expect(/redis@sha256:[0-9a-f]{64}/u.test(redisBlock), "optional Redis image must be digest pinned");
for (const [name, block] of [
  ["team-os", teamBlock],
  ["migrate", migrateBlock],
  ["postgres", postgresBlock],
  ["redis", redisBlock],
]) {
  expect(/ulimits:\s*\n\s*core: 0/u.test(block), `${name} must disable core dumps`);
}
for (const [name, block] of [
  ["migrate", migrateBlock],
  ["postgres", postgresBlock],
  ["redis", redisBlock],
]) {
  expect(!/^\s{4}ports:/mu.test(block), `${name} must not publish a host port`);
}
for (const [name, block] of serviceBlocks) {
  if (name !== "team-os") {
    expect(/profiles:/u.test(block), `${name} must be opt-in so team-os is the only default service`);
  }
}
for (const volume of ["team_os_storage", "team_os_uploads", "postgres_data", "redis_data"]) {
  expect(new RegExp(`^  ${volume}:`, "mu").test(compose), `Compose must declare persistent volume ${volume}`);
}

const nginx = read("deploy/nginx/ai-team-os.conf");
expect(/listen 443 ssl/u.test(nginx), "Nginx must terminate HTTPS");
expect(/server 127\.0\.0\.1:3022/u.test(nginx), "Nginx upstream must use isolated loopback port 3022");
expect(/proxy_pass http:\/\/ai_team_os_backend/u.test(nginx), "Nginx must proxy Team OS web/API traffic");
expect(/gzip on;/u.test(nginx), "Nginx must enable gzip");
for (const header of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
  expect(nginx.includes(header), `Nginx must set ${header}`);
}
expect(/location = \/updates\/ai-team-os\/version\.json/u.test(nginx), "Nginx must expose the isolated Team OS version manifest");
expect(/location = \/api\/activate/u.test(nginx), "Nginx must allow the existing unlock compatibility endpoint");
expect(/assets\/\|brand\/\|icons\//u.test(nginx), "Nginx must expose the static brand assets used by the shared login and metadata pages");
expect(/location \/ \{\s*return 404;/su.test(nginx), "Nginx must deny unrelated monolith routes by default");
expect(/listen 80 default_server/u.test(nginx) && /return 444;/u.test(nginx), "Nginx must reject unknown Host headers");
expect(!/return 301 https:\/\/\$host/u.test(nginx), "Nginx redirects must not reflect an untrusted Host header");
expect(!/\$proxy_add_x_forwarded_for/u.test(nginx), "single-hop Nginx must replace untrusted X-Forwarded-For values");
expect(/\$request_method \$uri \$server_protocol/u.test(nginx), "Nginx access logs must record the normalized URI");
expect(!/log_format[^;]*\$request_uri/su.test(nginx), "Nginx access logs must not record query strings");
expect(!/log_format[^;]*\$http_referer/su.test(nginx), "Nginx access logs must not record referrer query strings");
const hostHeaderCount = nginx.match(/proxy_set_header Host \$host;/gu)?.length ?? 0;
const forwardedHostHeaderCount = nginx.match(/proxy_set_header X-Forwarded-Host \$host;/gu)?.length ?? 0;
expect(hostHeaderCount > 0 && forwardedHostHeaderCount === hostHeaderCount, "Every proxied Nginx location must replace X-Forwarded-Host with the validated Host");

const scripts = new Map([
  ["deploy.sh", read("deploy/scripts/deploy.sh")],
  ["backup.sh", read("deploy/scripts/backup.sh")],
  ["rollback.sh", read("deploy/scripts/rollback.sh")],
]);
const envLoader = read("deploy/scripts/load-env.sh");
expect(/ai_team_os_load_env/u.test(envLoader), "load-env.sh must expose the strict dotenv loader");
expect(/Unsupported environment key/u.test(envLoader), "load-env.sh must enforce an environment-key allowlist");
expect(/Duplicate environment key/u.test(envLoader), "load-env.sh must reject duplicate keys");
expect(!/\beval\b/u.test(envLoader), "load-env.sh must never evaluate dotenv values");
const schemaVerifier = read("deploy/scripts/verify-team-os-schema.mjs");
for (const tableName of [
  "team_organizations",
  "team_os_tenant_companies",
  "team_tasks",
  "crm_customers",
  "training_courses",
  "workflow_definitions",
]) {
  expect(schemaVerifier.includes(tableName), `Team OS schema verifier must check ${tableName}`);
}
const forbiddenScriptPatterns = [
  /git\s+reset\s+--hard/iu,
  /prisma\s+migrate\s+reset/iu,
  /prisma\s+db\s+push/iu,
  /docker\s+compose[^\n]*\sdown(?:\s|$)/iu,
  /DROP\s+DATABASE/iu,
];
for (const [name, source] of scripts) {
  expect(source.startsWith("#!/usr/bin/env bash\nset -Eeuo pipefail"), `${name} must use Bash strict mode`);
  expect(/\bflock\b/u.test(source), `${name} must prevent concurrent execution with flock`);
  for (const pattern of forbiddenScriptPatterns) {
    expect(!pattern.test(source), `${name} contains forbidden destructive operation ${pattern}`);
  }
  expect(!/source\s+["']?\$ENV_FILE/u.test(source), `${name} must not source the production dotenv file`);
  if (name === "backup.sh") {
    expect(/ai_team_os_load_env\s+"\$ENV_SNAPSHOT_FILE"/u.test(source), "backup.sh must load the same root-only environment snapshot that it encrypts");
  } else {
    expect(/ai_team_os_load_env\s+"\$ENV_FILE"/u.test(source), `${name} must use the strict dotenv loader`);
  }
  expect(/prepare_root_directory/u.test(source), `${name} must create and verify root-owned deployment directories`);
  expect(/managed directory component must not be group\/world writable/u.test(source), `${name} must reject writable deployment path components`);
  expect(/require_root_control_file\s+"\$(?:DEPLOY|BACKUP)_LOCK_FILE"/u.test(source), `${name} must verify existing lock-file ownership and reject symbolic links`);
}

for (const [name, source] of scripts) {
  verifyCleanEnvironmentContract(name, `deploy/scripts/${name}`, source);
}

const deployScript = scripts.get("deploy.sh") ?? "";
expect(deployScript.lastIndexOf("backup.sh") < deployScript.lastIndexOf("migrate deploy"), "deploy.sh must back up before running migrate deploy");
expect(/up -d --no-deps --no-build team-os/u.test(deployScript), "deploy.sh must replace only the team-os application service");
expect(/chmod -R a-w/u.test(deployScript), "deploy.sh must lock the completed release tree");
expect(/status identity check failed/u.test(deployScript), "deploy.sh must gate activation on exact status identity");
expect(/readiness check failed/u.test(deployScript), "deploy.sh must gate activation on database/schema/AI readiness");
expect(/validate_production_environment/u.test(deployScript), "deploy.sh must validate the populated production environment without running fetched code as root");
expect(/requirePinnedDatabaseCa/u.test(deployScript) && /DATABASE_CA_CERT/u.test(deployScript), "deploy.sh must enforce the fixed per-client database CA contract");
expect(!/corepack enable|pnpm install --frozen-lockfile/u.test(deployScript), "deploy.sh must not execute fetched package scripts as host root");
expect(/CONFIRM_MIGRATIONS/u.test(deployScript), "deploy.sh must require explicit migration approval");
expect(/fetched git ref does not match the approved release SHA/u.test(deployScript), "deploy.sh must pin git fetches to an approved full SHA");
expect(/restore_original_application/u.test(deployScript), "deploy.sh must restore the prior application image after a failed cutover");
expect(/ORIGINAL_COMPOSE/u.test(deployScript), "deploy.sh must restore with the original release Compose configuration");
expect(/ACTIVATION_COMMITTED/u.test(deployScript), "deploy.sh must compensate failures until activation state is committed");
expect(/RUNTIME_IMAGE_ID/u.test(deployScript), "deploy.sh must record the content-addressed runtime image ID");
expect(/DEPLOY_SOURCE_ARCHIVE_SHA256/u.test(deployScript), "deploy.sh must verify archive transfer integrity");
expect(/ORCHESTRATOR_SHA256/u.test(deployScript), "deploy.sh must record the pinned orchestrator bundle hash");
expect(
  ["deploy/scripts/production-health-check.sh", "deploy/scripts/server-init.sh", "deploy/scripts/cloud-preflight-check.sh"].every((relativePath) =>
    orchestratorV2Includes(deployScript, relativePath),
  ),
  "deploy.sh must include Phase 14 host controls in the schema v2 orchestrator hash",
);
expect(/ORCHESTRATOR_SCHEMA_CURRENT=2/u.test(deployScript) && /\$\{ORCHESTRATOR_SCHEMA:-1\}/u.test(deployScript), "deploy.sh must version orchestrator hashes while retaining Phase 13 metadata compatibility");
expect(/deploy-env\.XXXXXXXX/u.test(deployScript) && /install -o root -g root -m 0600 -- "\$ENV_FILE" "\$ENV_SNAPSHOT_FILE"/u.test(deployScript), "deploy.sh must freeze one root-only environment snapshot before backup, migration, and runtime cutover");
expect(/SOURCE_REF=%s/u.test(deployScript) && /validate_source_ref/u.test(deployScript), "deploy.sh must record a validated source ref for tag-addressable rollback");
expect(/archive mode records commit\/<sha> provenance and does not accept DEPLOY_RELEASE_REF/u.test(deployScript), "archive deployments must not claim unverified tag provenance");
expect(/ARCHIVE_COPY="\$STAGING_DIR\/\.approved-source\.tar"/u.test(deployScript), "deploy.sh must freeze an uploaded archive into the root-owned staging tree");
expect(/install -o root -g root -m 0600 -- "\$DEPLOY_SOURCE_ARCHIVE" "\$ARCHIVE_COPY"/u.test(deployScript), "deploy.sh must create a root-only archive snapshot before verification");
expect(/tar -tf "\$ARCHIVE_COPY" >\/dev\/null/u.test(deployScript), "deploy.sh must validate the frozen archive before scanning it");
expect(!/tar -tf[^\n]*\|\s*grep\s+-Eq/u.test(deployScript), "archive path scanning must not use early-exit grep under pipefail");
expect(/full commit SHA or a canonical refs\/tags/u.test(deployScript), "git mode must reject mutable branch refs");
for (const fixedPathGuard of [
  "DEPLOY_BASE_DIR must remain /opt/ai-team-os",
  "DEPLOY_STATE_DIR must remain /var/lib/ai-team-os",
  "TEAM_OS_VERSION_TARGET must remain /var/www/ai-team-os/updates/VERSION_CHECK.json",
  "TEAM_OS_HEALTH_URL must remain the fixed loopback Team OS status endpoint",
  "TEAM_OS_READINESS_URL must remain the fixed loopback readiness endpoint",
  "DEPLOY_LOCK_FILE must remain /run/ai-team-os/deploy.lock",
]) {
  expect(deployScript.includes(fixedPathGuard), `deploy.sh is missing fixed path guard: ${fixedPathGuard}`);
}
expect(/TRUSTED_REPOSITORY_ROOT\/deploy\/scripts\/backup\.sh/u.test(deployScript), "deploy.sh must run the host-pinned backup script");
expect(/require_root_release_tree/u.test(deployScript) && /require_root_control_file/u.test(deployScript), "deploy.sh must verify immutable root-owned release and state controls");
expect(
  deployScript.indexOf('flock -n 9') < deployScript.lastIndexOf('cleanup_stale_environment_snapshots')
    && deployScript.lastIndexOf('cleanup_stale_environment_snapshots') < deployScript.indexOf('mktemp /run/ai-team-os/deploy-env.'),
  "deploy.sh must lock and safely remove stale snapshots before creating a new environment snapshot"
);

const backupScript = scripts.get("backup.sh") ?? "";
expect(/pg_dump/u.test(backupScript) && /sha256sum/u.test(backupScript), "backup.sh must produce and checksum a PostgreSQL dump");
expect(/openssl cms -encrypt/u.test(backupScript) && /configuration\.env\.cms/u.test(backupScript), "backup.sh must encrypt production configuration with the recovery public certificate");
expect(backupScript.includes("BEGIN ([A-Z0-9]+ )*PRIVATE KEY"), "backup.sh must reject unencrypted and encrypted private-key PEM blocks");
expect(/database\.dump\.cms/u.test(backupScript) && /database_encryption=openssl-cms-der-aes-256-cbc/u.test(backupScript), "backup.sh must publish only an encrypted database recovery object");
expect(/findmnt -n -o FSTYPE -T \/run\/ai-team-os/u.test(backupScript), "backup.sh must keep its plaintext dump on a verified tmpfs");
expect(/pg_database_size\(current_database\(\)\)/u.test(backupScript) && /DUMP_FILE_LIMIT_BLOCKS/u.test(backupScript), "backup.sh must size the database and enforce a plaintext dump limit before using tmpfs");
expect(/reserve_bytes=268435456/u.test(backupScript), "backup.sh must preserve a fixed tmpfs safety reserve for the host");
expect(/install -o root -g root -m 0600 -- "\$ENV_FILE" "\$ENV_SNAPSHOT_FILE"/u.test(backupScript), "backup.sh must snapshot configuration before loading database credentials");
expect(/mktemp -d/u.test(backupScript) && /mv -- "\$BUNDLE_DIR" "\$FINAL_BUNDLE_DIR"/u.test(backupScript), "backup.sh must atomically publish a complete recovery bundle");
expect(/root-only environment snapshot changed while the database dump was running/u.test(backupScript), "backup.sh must reject recovery snapshot changes during the dump window");
expect(/config_sha256_file=/u.test(backupScript), "backup.sh metadata must reference the configuration checksum");
expect(/recipient_cert_fingerprint_sha256=/u.test(backupScript), "backup.sh metadata must identify the non-secret recovery certificate fingerprint");
expect(/DEPLOY_BACKUP_DIR must remain \/var\/backups\/ai-team-os/u.test(backupScript), "backup.sh must pin its backup root");
expect(/BACKUP_LOCK_FILE must remain \/run\/ai-team-os\/backup\.lock/u.test(backupScript), "backup.sh must pin its lock file");
expect(!/--dbname\s+"\$DATABASE_URL"/u.test(backupScript), "backup.sh must not expose DATABASE_URL in host process arguments");
expect(/BACKUP_DATABASE_URL is required/u.test(backupScript), "backup.sh must require a dedicated libpq backup URL");
expect(!/\$\{(?:DIRECT_URL|DATABASE_URL):-/u.test(backupScript), "backup.sh must not fall back to Prisma runtime or migration URLs");
expect(/PG_BACKUP_IMAGE.*@sha256:/u.test(backupScript), "backup.sh must use a digest-pinned PostgreSQL client image");
expect(/DATABASE_CA_CERT must remain \/etc\/ai-team-os\/rds-ca\.pem/u.test(backupScript), "backup.sh must pin and validate its RDS CA path");
expect((backupScript.match(/--mount "type=bind,source=\$\{DATABASE_CA_CERT\},target=\/etc\/ai-team-os\/rds-ca\.pem,readonly"/gu) ?? []).length >= 2, "backup database probes and dumps must mount the same RDS CA read-only");
expect(/--read-only/u.test(backupScript) && /--cap-drop ALL/u.test(backupScript) && /no-new-privileges/u.test(backupScript), "backup containers must be read-only and privilege-dropped");
expect(/docker run --rm -i[\s\S]*?--entrypoint pg_restore[\s\S]*?--list/u.test(backupScript), "backup.sh must attach stdin while validating the dump with pg_restore");
expect(!/database\.dump(?:\s|"|')/u.test(backupScript), "backup.sh must not publish a plaintext database.dump file");
expect(
  backupScript.indexOf('flock -n 8') < backupScript.lastIndexOf('cleanup_stale_backup_runtime_files')
    && backupScript.lastIndexOf('cleanup_stale_backup_runtime_files') < backupScript.indexOf('mktemp /run/ai-team-os/backup-env.'),
  "backup.sh must lock and safely remove stale plaintext tmpfs files before creating a new snapshot"
);

const rollbackScript = scripts.get("rollback.sh") ?? "";
expect(/up -d --no-deps --no-build team-os/u.test(rollbackScript), "rollback.sh must switch only team-os");
expect(!/migrate\s+deploy(?:\s|$)|pg_restore/iu.test(rollbackScript), "rollback.sh must not alter the database");
expect(/No database rollback was attempted/u.test(rollbackScript), "rollback.sh must state that database rollback is separate");
expect(/CONFIRM_ROLLBACK/u.test(rollbackScript), "rollback.sh must require explicit operator confirmation");
expect(/ACTUAL_RUNTIME_IMAGE_ID/u.test(rollbackScript), "rollback.sh must verify the recorded image ID before switching");
expect(/TEAM_OS_READINESS_URL/u.test(rollbackScript), "rollback.sh must verify database/schema/AI readiness");
expect(/restore_original_application/u.test(rollbackScript), "rollback.sh must restore the pre-rollback image on failure");
expect(/ORIGINAL_COMPOSE/u.test(rollbackScript), "rollback.sh must restore with the pre-rollback Compose configuration");
expect(/ACTIVATION_COMMITTED/u.test(rollbackScript), "rollback.sh must compensate failures until rollback state is committed");
expect(/ORCHESTRATOR_SHA256/u.test(rollbackScript), "rollback.sh must verify the recorded orchestrator bundle hash");
expect(
  ["deploy/scripts/production-health-check.sh", "deploy/scripts/server-init.sh", "deploy/scripts/cloud-preflight-check.sh"].every((relativePath) =>
    orchestratorV2Includes(rollbackScript, relativePath),
  ),
  "rollback.sh must verify Phase 14 host controls as part of the schema v2 orchestrator hash",
);
expect(/ORCHESTRATOR_SCHEMA_CURRENT=2/u.test(rollbackScript) && /\$\{ORCHESTRATOR_SCHEMA:-1\}/u.test(rollbackScript), "rollback.sh must select the recorded orchestrator hash schema for legacy and Phase 14 releases");
expect(/rollback-env\.XXXXXXXX/u.test(rollbackScript), "rollback.sh must use one root-only environment snapshot for the entire switch");
expect(/--tag/u.test(rollbackScript) && /TAG_MATCHES/u.test(rollbackScript), "rollback.sh must resolve a requested Git tag from immutable release metadata");
expect(/\$\{#TAG_MATCHES\[@\]\} == 1/u.test(rollbackScript), "rollback.sh must reject missing or ambiguous tag matches");
expect(/TARGET_TAG_REF="refs\/tags\/\$TARGET_TAG"/u.test(rollbackScript), "rollback.sh must normalize short tag names to refs/tags");
expect(/CANDIDATE_RELEASES=\("\$RELEASES_ROOT"\/\*\)/u.test(rollbackScript), "rollback.sh must enumerate immutable releases without losing a find subprocess error");
for (const fixedPathGuard of [
  "DEPLOY_BASE_DIR must remain /opt/ai-team-os",
  "DEPLOY_STATE_DIR must remain /var/lib/ai-team-os",
  "TEAM_OS_VERSION_TARGET must remain /var/www/ai-team-os/updates/VERSION_CHECK.json",
  "TEAM_OS_HEALTH_URL must remain the fixed loopback Team OS status endpoint",
  "TEAM_OS_READINESS_URL must remain the fixed loopback readiness endpoint",
  "DEPLOY_LOCK_FILE must remain /run/ai-team-os/deploy.lock",
]) {
  expect(rollbackScript.includes(fixedPathGuard), `rollback.sh is missing fixed path guard: ${fixedPathGuard}`);
}
expect(/require_root_release_tree/u.test(rollbackScript) && /require_root_control_file/u.test(rollbackScript), "rollback.sh must verify immutable root-owned release and state controls");
expect(
  rollbackScript.indexOf('flock -n 9') < rollbackScript.lastIndexOf('cleanup_stale_environment_snapshots')
    && rollbackScript.lastIndexOf('cleanup_stale_environment_snapshots') < rollbackScript.indexOf('mktemp /run/ai-team-os/rollback-env.'),
  "rollback.sh must lock and safely remove stale snapshots before creating a new environment snapshot"
);

for (const [name, source] of [
  ["deploy.sh", deployScript],
  ["rollback.sh", rollbackScript],
]) {
  expect(/removing the failed candidate application|removing the failed rollback candidate application/iu.test(source), `${name} must remove a failed candidate when no prior application baseline exists`);
  expect(/ps -aq team-os/u.test(source), `${name} must verify that a failed candidate container was removed`);
  expect(/max-time 2 "\$TEAM_OS_HEALTH_URL"/u.test(source), `${name} must verify that a failed candidate no longer responds on the private health endpoint`);
}

expect(/CI=true pnpm prune --prod --ignore-scripts/u.test(dockerfile), "Docker production dependency pruning must be non-interactive and must not rerun the root postinstall without the Prisma CLI");
expect(/cp -a \/tmp\/prisma-client\/\. "\$generated_client\/"/u.test(dockerfile), "Docker production dependencies must restore the generated Prisma Client after pruning");
expect(/new PrismaClient\(\)/u.test(dockerfile), "Docker production dependencies must verify the restored Prisma Client");

const serverInitScript = read("deploy/scripts/server-init.sh");
expect(serverInitScript.startsWith("#!/usr/bin/env bash\nset -Eeuo pipefail"), "server-init.sh must use Bash strict mode");
expect(/INSTALL_REQUESTED=false/u.test(serverInitScript), "server-init.sh must default to check-only mode");
expect(/--install/u.test(serverInitScript) && /--confirm-install/u.test(serverInitScript), "server-init.sh must require two explicit installation signals");
expect(/policy-rc\.d/u.test(serverInitScript), "server-init.sh must block package scripts from starting services");
expect(!/systemctl\s+(?:start|restart|reload|enable)/u.test(serverInitScript), "server-init.sh must not directly start, restart, reload, or enable services");
expect(!/NEEDRESTART_MODE=a/u.test(serverInitScript), "server-init.sh must not request automatic service restarts");
expect(/docker buildx version/u.test(serverInitScript), "server-init.sh must verify Docker Buildx");
expect(/check_required_tools/u.test(serverInitScript), "server-init.sh must audit host tools used by release scripts");
expect(/validate_selected_package_candidates/u.test(serverInitScript), "server-init.sh must reject apt candidates below the documented Node and Compose baselines before installation");
expect(/docker docker\.socket containerd nginx/u.test(serverInitScript), "server-init.sh must detect package changes to Docker socket activation as well as service state");

const cloudPreflightScript = read("deploy/scripts/cloud-preflight-check.sh");
expect(cloudPreflightScript.startsWith("#!/usr/bin/env bash\nset -Eeuo pipefail\nset +x"), "cloud-preflight-check.sh must use Bash strict mode and disable xtrace");
expect(/MIN_CPU=.*4/u.test(cloudPreflightScript), "cloud preflight must require at least four online CPUs");
expect(/MIN_MEMORY_MIB=.*7000/u.test(cloudPreflightScript) && /MIN_AVAILABLE_MEMORY_MIB=.*2048/u.test(cloudPreflightScript), "cloud preflight must enforce total and available memory baselines");
expect(/MIN_TOTAL_DISK_GIB=.*75/u.test(cloudPreflightScript) && /MIN_DISK_GIB=.*30/u.test(cloudPreflightScript), "cloud preflight must enforce total and free disk baselines");
expect(/check_ingress_port 80 HTTP/u.test(cloudPreflightScript) && /check_ingress_port 443 HTTPS/u.test(cloudPreflightScript), "cloud preflight must inspect HTTP and HTTPS ingress ports");
expect(/check_private_team_os_listener/u.test(cloudPreflightScript) && /127\\\.0\\\.0\\\.1:3022/u.test(cloudPreflightScript), "cloud preflight must keep Team OS on loopback port 3022");
expect(/docker compose version/u.test(cloudPreflightScript) && /docker buildx version/u.test(cloudPreflightScript), "cloud preflight must validate Compose and Buildx");
expect(/DATABASE_CA_CERT must remain \/etc\/ai-team-os\/rds-ca\.pem/u.test(cloudPreflightScript) && /valid X\.509 CA certificate/u.test(cloudPreflightScript), "cloud preflight must validate the fixed RDS CA before probing identities");
expect(/BACKUP_ENCRYPTION_CERT must remain \/etc\/ai-team-os\/backup-encryption-cert\.pem/u.test(cloudPreflightScript) && /valid X\.509 recipient certificate/u.test(cloudPreflightScript), "cloud preflight must validate the public-only backup recipient certificate");
expect(/PGSSLMODE=verify-full/u.test(cloudPreflightScript) && /PGSSLROOTCERT/u.test(cloudPreflightScript), "cloud preflight must verify the RDS CA and hostname with libpq");
expect(/psql[\s\S]*--command 'SELECT 1'/u.test(cloudPreflightScript), "cloud preflight must perform authenticated PostgreSQL SELECT 1 probes");
for (const key of ["DATABASE_URL", "DIRECT_URL", "BACKUP_DATABASE_URL"]) {
  expect(new RegExp(`check_database_connection ${key}\\b`, "u").test(cloudPreflightScript), `cloud preflight must probe ${key}`);
}
expect(/unset "\$database_url_name"/u.test(cloudPreflightScript), "cloud preflight must clear each database URL after safe parsing");
expect(!/psql\s+"\$DATABASE_URL"/u.test(cloudPreflightScript), "cloud preflight must not expose DATABASE_URL in process arguments");
expect(/LICENSE_SECRET/u.test(cloudPreflightScript) && /DEPLOY_REPOSITORY_URL/u.test(cloudPreflightScript), "cloud preflight must enforce the same license and Git source requirements as deploy.sh");
expect(/TEAM_OS_INTEGRATION_ENCRYPTION_KEY/u.test(cloudPreflightScript) && /exactly match ENCRYPTION_KEY/u.test(cloudPreflightScript), "cloud preflight must reject a divergent compatibility encryption key");
expect(!/\b(?:apt|apt-get|dnf|yum|apk)\s+(?:install|upgrade|update)\b/u.test(cloudPreflightScript), "cloud preflight must not install or update packages");
expect(!/\bsystemctl\s+(?:start|restart|reload|enable|disable|stop)\b/u.test(cloudPreflightScript), "cloud preflight must not mutate services");
expect(!/\bdocker(?:\s+compose)?\s+(?:pull|build|run|up|down|restart|stop|rm)\b/u.test(cloudPreflightScript), "cloud preflight must not mutate Docker state");
expect(!/\bprisma\s+migrate\b/u.test(cloudPreflightScript), "cloud preflight must not run migrations");
expect(!/(?:^|\s)(?:ssh|scp)\s+/mu.test(cloudPreflightScript), "cloud preflight must not connect to a remote host");

const healthCheckScript = read("deploy/scripts/production-health-check.sh");
expect(/ulimit -c 0/u.test(healthCheckScript), "production-health-check.sh must disable core dumps");
expect(/RUNTIME_DIR=\/run\/ai-team-os/u.test(healthCheckScript), "production-health-check.sh must use the root-controlled runtime directory");
expect(/findmnt -n -o FSTYPE -T "\$RUNTIME_DIR"/u.test(healthCheckScript), "production-health-check.sh must verify that response files stay on tmpfs");
expect(/\/proc\/swaps/u.test(healthCheckScript), "production-health-check.sh must reject active swap before storing response bodies");
expect(/flock -n 8/u.test(healthCheckScript), "production-health-check.sh must serialize sensitive response cleanup");
expect(!healthCheckScript.includes("/tmp/ai-team-os-health"), "production-health-check.sh must not store response bodies in shared /tmp");
expect(/CURRENT_RELEASE_FILE=\$DEPLOY_STATE_DIR\/current-release/u.test(healthCheckScript), "production-health-check.sh must bind checks to the recorded current release");
expect(/payload\.releaseSha === expectedSha/u.test(healthCheckScript), "production-health-check.sh must compare the API release SHA with immutable metadata");
expect(/container image ID does not match the recorded release/u.test(healthCheckScript), "production-health-check.sh must compare the running image ID with immutable metadata");
expect(/find "\$current_release" -xdev ! -user root/u.test(healthCheckScript), "production-health-check.sh must verify release-tree ownership");
expect(/find "\$current_release" -xdev -perm \/022/u.test(healthCheckScript), "production-health-check.sh must reject writable release-tree entries");
expect(/calculate_orchestrator_sha256/u.test(healthCheckScript) && /orchestrator hash does not match immutable metadata/u.test(healthCheckScript), "production-health-check.sh must verify the recorded orchestrator hash");
expect(
  ["deploy/scripts/production-health-check.sh", "deploy/scripts/server-init.sh", "deploy/scripts/cloud-preflight-check.sh"].every((relativePath) =>
    orchestratorV2Includes(healthCheckScript, relativePath),
  ),
  "production-health-check.sh must verify every Phase 14 host control in the schema v2 orchestrator hash",
);
expect(/payload\.ok === true/u.test(healthCheckScript), "production-health-check.sh must require the readiness endpoint to report global ok=true");
expect(/selectAvailability\("auth"\)/u.test(healthCheckScript) && /selectAvailability\("license"\)/u.test(healthCheckScript), "production-health-check.sh must fail closed when auth or license readiness is unavailable");
expect(/"\$code" == 200/u.test(healthCheckScript) && !/"\$code" == 503/u.test(healthCheckScript), "production-health-check.sh must only accept HTTP 200 readiness responses");

for (const [name, source] of [
  ["server-init.sh", serverInitScript],
  ["cloud-preflight-check.sh", cloudPreflightScript],
  ["production-health-check.sh", healthCheckScript],
]) {
  verifyCleanEnvironmentContract(name, `deploy/scripts/${name}`, source);
}

for (const [name, source] of [
  ["deploy.sh", deployScript],
  ["backup.sh", backupScript],
  ["rollback.sh", rollbackScript],
  ["server-init.sh", serverInitScript],
  ["cloud-preflight-check.sh", cloudPreflightScript],
  ["production-health-check.sh", healthCheckScript],
]) {
  expect(/ulimit -c 0/u.test(source), `${name} must disable host-side core dumps`);
}
expect((backupScript.match(/--ulimit core=0/gu) ?? []).length >= 3, "backup.sh must disable core dumps for every PostgreSQL helper container");

const healthScript = read("deploy/scripts/production-health-check.sh");
expect(healthScript.startsWith("#!/usr/bin/env bash\nset -Eeuo pipefail"), "production-health-check.sh must use Bash strict mode");
expect(/--max-redirs 0/u.test(healthScript), "production health checks must not follow redirects to untrusted locations");
expect(/--max-filesize 1048576/u.test(healthScript), "production health checks must bound response bodies");
expect(/TEAM_OS_HEALTH_URL/u.test(healthScript) && /TEAM_OS_READINESS_URL/u.test(healthScript), "production health check must cover status and shared readiness");
expect(/unverified/iu.test(healthScript), "unauthenticated notification probing must be reported as unverified, not healthy delivery");
expect(/validate_authenticated_message_target/u.test(healthScript) && /target\.origin === production\.origin/u.test(healthScript), "authenticated notification checks must stay on loopback or the exact production origin");
expect(/Response\s+bodies, URLs, cookies/iu.test(healthScript), "production health report must document output redaction");
expect(/curl --disable --noproxy '\*'/u.test(healthScript), "production health probes must ignore user curl config and proxy environment variables");

const aliyunRunbook = read("docs/cloud/ALIYUN_DEPLOYMENT.md");
const pilotPlan = read("docs/cloud/PILOT_TEST_PLAN.md");
expect(/NOT DEPLOYED \/ NOT VERIFIED/u.test(aliyunRunbook), "Aliyun runbook must not claim an unverified deployment");
expect(/Pilot Company/u.test(pilotPlan) && /Control Company/u.test(pilotPlan), "Pilot plan must include a control tenant for isolation testing");
const domainRunbook = read("docs/cloud/DOMAIN_SSL_PRODUCTION.md");
expect(/flock -n \/run\/lock\/ai-team-os-nginx\.lock/u.test(domainRunbook) && /rollback_config/u.test(domainRunbook), "Nginx production cutover must be locked and restore the old configuration after validation or reload failure");

const executionGuide = read("docs/cloud/ALIYUN_EXECUTION_GUIDE.md");
const productionCommands = read("docs/cloud/PRODUCTION_COMMANDS.md");
const databaseRelease = read("docs/cloud/DATABASE_RELEASE.md");
const httpsSetup = read("docs/cloud/HTTPS_SETUP.md");
for (const [name, source] of [
  ["ALIYUN_EXECUTION_GUIDE.md", executionGuide],
  ["PRODUCTION_COMMANDS.md", productionCommands],
  ["DATABASE_RELEASE.md", databaseRelease],
  ["HTTPS_SETUP.md", httpsSetup],
]) {
  expect(/PREPARATION ONLY \/ NOT EXECUTED/u.test(source), `${name} must not claim that production actions were executed`);
  for (const pattern of highConfidenceSecretPatterns) {
    expect(!pattern.test(source), `${name} contains a value that resembles a real secret (${pattern})`);
  }
}
expect(/cloud-preflight-check\.sh/u.test(executionGuide), "Aliyun execution guide must run the read-only cloud preflight");
expect(/CONFIRM_MIGRATIONS=true/u.test(executionGuide), "Aliyun execution guide must require explicit migration confirmation");
for (const [name, source] of [
  ["ALIYUN_EXECUTION_GUIDE.md", executionGuide],
  ["PRODUCTION_COMMANDS.md", productionCommands],
]) {
  expect(
    /git -C "\$CONTROL_CANDIDATE" fetch --force --no-tags origin\s+\\?\s*"\$\{CONTROL_TAG\}:\$\{CONTROL_TAG\}"/u.test(source),
    `${name} must materialize the approved control tag with an explicit tag-to-tag refspec`
  );
}
expect(/生产唯一入口是 `deploy\.sh`|生产标准入口只有 `deploy\.sh`/u.test(`${executionGuide}\n${productionCommands}`), "production docs must identify deploy.sh as the production release entry point");
expect(/生产禁止直接执行[\s\S]*docker compose up -d/u.test(productionCommands), "production command guide must reject a bare Compose cutover");
expect(/生产禁止直接执行[\s\S]*npx prisma migrate deploy/u.test(productionCommands), "production command guide must reject host-side Prisma migration");
const isolatedMigrationSection = productionCommands.match(/## 8\. 隔离环境 migration 演练[\s\S]*?(?=\n## 9\.)/u)?.[0] ?? "";
expect(/ISOLATED_ENV_FILE/u.test(isolatedMigrationSection), "migration rehearsal commands must require an explicit isolated environment file");
expect(!/--env-file \/etc\/ai-team-os\/ai-team-os\.env/u.test(isolatedMigrationSection), "migration rehearsal commands must not target the production environment file");
expect(/RDS 手工快照/u.test(databaseRelease) && /CMS 加密逻辑备份/u.test(databaseRelease), "database release checklist must require both snapshot and encrypted logical backup evidence");
expect(/只回滚应用 release\/镜像/u.test(databaseRelease), "database release checklist must separate application rollback from database recovery");
expect(/127\.0\.0\.1:3022/u.test(httpsSetup), "HTTPS checklist must keep Team OS on the loopback upstream");
expect(/curl --resolve/u.test(httpsSetup) && /openssl s_client/u.test(httpsSetup), "HTTPS checklist must require DNS-independent TLS verification");

const dockerIgnore = read(".dockerignore");
expect(/!\.env\.production\.template/u.test(dockerIgnore), "Docker build context must include the safe production environment template");

if (failures.length > 0) {
  console.error("AI Team OS deployment contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AI Team OS deployment contract passed.");
console.log(`Validated ${requiredAssets.length} deployment assets, isolated Compose profiles, HTTPS ingress, version manifest, and safe release scripts.`);
