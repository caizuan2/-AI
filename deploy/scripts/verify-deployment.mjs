import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");
const failures = [];

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
  "deploy/VERSION_CHECK.json",
  "deploy/docker/Dockerfile.production",
  "deploy/docker/docker-compose.yml",
  "deploy/nginx/ai-team-os.conf",
  "deploy/scripts/deploy.sh",
  "deploy/scripts/backup.sh",
  "deploy/scripts/rollback.sh",
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
expect(environment.get("APP_URL") !== environment.get("NEXT_PUBLIC_APP_URL"), "APP_URL must use a separate trusted knowledge-service origin");
expect(!(environment.get("BACKUP_DATABASE_URL") ?? "").includes("schema="), "BACKUP_DATABASE_URL must be a libpq URL without Prisma schema parameters");

const highConfidenceSecretPatterns = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\bLTAI[A-Za-z0-9]{12,}\b/u,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
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
  expect(/ai_team_os_load_env\s+"\$ENV_FILE"/u.test(source), `${name} must use the strict dotenv loader`);
  expect(/prepare_root_directory/u.test(source), `${name} must create and verify root-owned deployment directories`);
  expect(/managed directory component must not be group\/world writable/u.test(source), `${name} must reject writable deployment path components`);
  expect(/require_root_control_file\s+"\$(?:DEPLOY|BACKUP)_LOCK_FILE"/u.test(source), `${name} must verify existing lock-file ownership and reject symbolic links`);
}

const deployScript = scripts.get("deploy.sh") ?? "";
expect(deployScript.lastIndexOf("backup.sh") < deployScript.lastIndexOf("migrate deploy"), "deploy.sh must back up before running migrate deploy");
expect(/up -d --no-deps --no-build team-os/u.test(deployScript), "deploy.sh must replace only the team-os application service");
expect(/chmod -R a-w/u.test(deployScript), "deploy.sh must lock the completed release tree");
expect(/status identity check failed/u.test(deployScript), "deploy.sh must gate activation on exact status identity");
expect(/readiness check failed/u.test(deployScript), "deploy.sh must gate activation on database/schema/AI readiness");
expect(/validate_production_environment/u.test(deployScript), "deploy.sh must validate the populated production environment without running fetched code as root");
expect(!/corepack enable|pnpm install --frozen-lockfile/u.test(deployScript), "deploy.sh must not execute fetched package scripts as host root");
expect(/CONFIRM_MIGRATIONS/u.test(deployScript), "deploy.sh must require explicit migration approval");
expect(/fetched git ref does not match the approved release SHA/u.test(deployScript), "deploy.sh must pin git fetches to an approved full SHA");
expect(/restore_original_application/u.test(deployScript), "deploy.sh must restore the prior application image after a failed cutover");
expect(/ORIGINAL_COMPOSE/u.test(deployScript), "deploy.sh must restore with the original release Compose configuration");
expect(/ACTIVATION_COMMITTED/u.test(deployScript), "deploy.sh must compensate failures until activation state is committed");
expect(/RUNTIME_IMAGE_ID/u.test(deployScript), "deploy.sh must record the content-addressed runtime image ID");
expect(/DEPLOY_SOURCE_ARCHIVE_SHA256/u.test(deployScript), "deploy.sh must verify archive transfer integrity");
expect(/ORCHESTRATOR_SHA256/u.test(deployScript), "deploy.sh must record the pinned orchestrator bundle hash");
expect(/TRUSTED_REPOSITORY_ROOT\/deploy\/scripts\/backup\.sh/u.test(deployScript), "deploy.sh must run the host-pinned backup script");
expect(/require_root_release_tree/u.test(deployScript) && /require_root_control_file/u.test(deployScript), "deploy.sh must verify immutable root-owned release and state controls");

const backupScript = scripts.get("backup.sh") ?? "";
expect(/pg_dump/u.test(backupScript) && /sha256sum/u.test(backupScript), "backup.sh must produce and checksum a PostgreSQL dump");
expect(!/--dbname\s+"\$DATABASE_URL"/u.test(backupScript), "backup.sh must not expose DATABASE_URL in host process arguments");
expect(/BACKUP_DATABASE_URL is required/u.test(backupScript), "backup.sh must require a dedicated libpq backup URL");
expect(!/\$\{(?:DIRECT_URL|DATABASE_URL):-/u.test(backupScript), "backup.sh must not fall back to Prisma runtime or migration URLs");
expect(/PG_BACKUP_IMAGE.*@sha256:/u.test(backupScript), "backup.sh must use a digest-pinned PostgreSQL client image");
expect(/--read-only/u.test(backupScript) && /--cap-drop ALL/u.test(backupScript) && /no-new-privileges/u.test(backupScript), "backup containers must be read-only and privilege-dropped");
expect(/docker run --rm -i[\s\S]*?--entrypoint pg_restore[\s\S]*?--list/u.test(backupScript), "backup.sh must attach stdin while validating the dump with pg_restore");

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
expect(/require_root_release_tree/u.test(rollbackScript) && /require_root_control_file/u.test(rollbackScript), "rollback.sh must verify immutable root-owned release and state controls");

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

const dockerIgnore = read(".dockerignore");
expect(/!\.env\.production\.template/u.test(dockerIgnore), "Docker build context must include the safe production environment template");

if (failures.length > 0) {
  console.error("AI Team OS deployment contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AI Team OS deployment contract passed.");
console.log(`Validated ${requiredAssets.length} deployment assets, isolated Compose profiles, HTTPS ingress, version manifest, and safe release scripts.`);
