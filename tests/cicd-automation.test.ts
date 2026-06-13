import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const workflowPath = ".github/workflows/release.yml";

assert.ok(existsSync(workflowPath), "release.yml must exist.");

const workflow = readFileSync(workflowPath, "utf8");
const manifestScript = readFileSync("scripts/generate-latest-manifest.mjs", "utf8");
const syncVersionScript = readFileSync("scripts/sync-version.mjs", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

function getJobBlock(jobName: string) {
  const start = workflow.indexOf(`  ${jobName}:`);
  assert.notEqual(start, -1, `${jobName} job must exist.`);

  const rest = workflow.slice(start + 1);
  const nextJob = rest.search(/\n  [a-z0-9-]+:/);
  return nextJob === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + nextJob);
}

const androidJob = getJobBlock("build-android-apk");
const windowsJob = getJobBlock("build-windows-exe");
const releaseJob = getJobBlock("release");

assert.match(workflow, /on:\s*\n\s+push:/);
assert.match(workflow, /branches:\s*\n\s+- main/);
assert.match(workflow, /tags:\s*\n\s+- "v\*"/);
assert.match(workflow, /tags:[\s\S]*- "\[0-9\]\*"/);
assert.match(workflow, /permissions:[\s\S]*contents: write/);

assert.match(workflow, /build-web:/);
assert.match(workflow, /build-android-apk:/);
assert.match(workflow, /build-windows-exe:/);
assert.match(workflow, /release:/);
assert.match(releaseJob, /needs:\s*\n\s+- build-android-apk\s*\n\s+- build-windows-exe/);

assert.match(workflow, /actions\/checkout@v4/);
assert.match(workflow, /actions\/setup-node@v4/);
assert.match(workflow, /actions\/setup-java@v4/);
assert.match(workflow, /node scripts\/sync-version\.mjs --env/);
assert.match(workflow, /corepack enable/);
assert.match(workflow, /pnpm install --frozen-lockfile/);

assert.match(workflow, /pnpm run build/);
assert.match(workflow, /pnpm run lint/);
assert.match(workflow, /pnpm run typecheck/);

assert.match(workflow, /npx cap sync android/);
assert.match(workflow, /\.\/gradlew assembleRelease/);
assert.match(workflow, /-PVERSION="\$\{VERSION\}"/);
assert.match(workflow, /-PBUILD="\$\{BUILD\}"/);
assert.match(androidJob, /java-version: "21"/);
assert.match(workflow, /android\/app\/build\/outputs\/apk\/release\/app-release\.apk/);
assert.match(androidJob, /Prepare Android release keystore/);
assert.match(androidJob, /KEYSTORE_BASE64/);
assert.match(androidJob, /KEYSTORE_PATH/);
assert.match(androidJob, /KEYSTORE_PASSWORD/);
assert.match(androidJob, /KEY_ALIAS/);
assert.match(androidJob, /KEY_PASSWORD/);
assert.match(androidJob, /Verify signed APK/);
assert.match(androidJob, /apksigner/);
assert.match(androidJob, /verify --verbose/);
assert.match(androidJob, /Signed release APK was not generated/);
assert.doesNotMatch(androidJob, /apk_source="android\/app\/build\/outputs\/apk\/release\/app-release-unsigned\.apk"/);
assert.match(workflow, /apk\/ai-knowledge-chat-latest\.apk/);
assert.match(workflow, /Collected Android APK is empty or missing/);
assert.match(workflow, /actions\/upload-artifact@v4[\s\S]*name: apk/);
assert.match(androidJob, /\n    needs: build-web/);
assert.doesNotMatch(androidJob, /\n\s+if:/);
assert.doesNotMatch(androidJob, /continue-on-error:\s*true/);
assert.doesNotMatch(androidJob, /build-windows-exe/);

assert.match(workflow, /pnpm exec electron-builder --win --publish never/);
assert.match(workflow, /node scripts\/sync-version\.mjs --package/);
assert.match(workflow, /ai-knowledge-chat-latest\.apk/);
assert.match(workflow, /exe\/ai-knowledge-chat-latest\.exe/);
assert.match(workflow, /actions\/upload-artifact@v4[\s\S]*name: exe/);
assert.match(windowsJob, /\n    needs: build-web/);
assert.doesNotMatch(windowsJob, /\n\s+if:/);
assert.doesNotMatch(windowsJob, /continue-on-error:\s*true/);
assert.doesNotMatch(windowsJob, /build-android-apk/);

assert.match(workflow, /Download APK/);
assert.match(workflow, /name: apk/);
assert.match(workflow, /path: apk/);
assert.match(workflow, /Download EXE/);
assert.match(workflow, /name: exe/);
assert.match(workflow, /path: exe/);
assert.match(workflow, /Verify APK and EXE assets/);
assert.match(workflow, /Android APK artifact is missing/);
assert.match(workflow, /public\/releases\/latest\.json/);
for (const field of ["version", "build", "apk", "exe", "apk_url", "exe_url", "web_url", "updated_at"]) {
  assert.match(manifestScript, new RegExp(field));
}
assert.match(workflow, /node scripts\/generate-latest-manifest\.mjs --release/);
assert.match(manifestScript, /version\.json/);
assert.match(syncVersionScript, /version\.json/);

assert.match(workflow, /gh release create/);
assert.match(workflow, /gh release edit/);
assert.match(workflow, /gh release upload/);
assert.match(workflow, /--clobber/);
assert.match(workflow, /\$\{APK_FILE\}/);
assert.match(workflow, /\$\{EXE_FILE\}/);
assert.match(workflow, /public\/releases\/latest\.json/);

assert.doesNotMatch(workflow, /NETLIFY_DEPLOY_HOOK_URL/);
assert.doesNotMatch(workflow, /VERCEL_DEPLOY_HOOK_URL/);
assert.doesNotMatch(workflow, /curl -fsS -X POST/);

assert.match(workflow, /GITHUB_REF_TYPE/);
assert.match(workflow, /GITHUB_REF_NAME/);
assert.match(workflow, /\$\{VERSION\}/);
assert.match(workflow, /\$\{BUILD\}/);
assert.match(workflow, /RELEASE_TAG/);
assert.doesNotMatch(workflow, /ci-\$\{GITHUB_RUN_NUMBER\}/);

assert.equal(packageJson.scripts.lint, "next lint");
assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
assert.equal(packageJson.scripts.build, "next build");

for (const pattern of [
  "dist/",
  "dist-app/",
  "android/app/build/",
  "public/downloads/",
  "public/uploads/",
  "*.exe",
  "*.apk",
  "*.asar",
  ".next/",
  "out/",
  "node_modules/"
]) {
  assert.match(gitignore, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

assert.doesNotMatch(workflow, /prisma\s+migrate/i);
assert.doesNotMatch(workflow, /DATABASE_URL/);
assert.doesNotMatch(workflow, /schema\.prisma/);
assert.doesNotMatch(workflow, /app\/workspace\/ingest/);
assert.doesNotMatch(workflow, /app\/\(user\)\/chat-ui/);
assert.doesNotMatch(workflow, /api\/auth/);
assert.doesNotMatch(workflow, /license/i);

console.log("CI/CD automation workflow tests passed.");
