import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const workflowPath = ".github/workflows/release.yml";

assert.ok(existsSync(workflowPath), "release.yml must exist.");

const workflow = readFileSync(workflowPath, "utf8");
const androidBuildGradle = readFileSync("android/app/build.gradle", "utf8");
const androidBuildScript = readFileSync("scripts/build-user-android.mjs", "utf8");
const androidPowerShell = readFileSync("scripts/build-android-apk.ps1", "utf8");
const windowsPowerShell = readFileSync("scripts/build-windows-exe.ps1", "utf8");
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

assert.equal(packageJson.scripts["apk:build"], "node scripts/build-user-android.mjs");
assert.match(androidBuildScript, /\[capacitorCli, "sync", "android"\]/);
assert.match(androidBuildScript, /cordova\.variables\.gradle/);
assert.match(androidBuildScript, /app-release\.apk/);
assert.match(androidJob, /pnpm run apk:build --/);
assert.match(androidJob, /-PVERSION="\$\{VERSION\}"/);
assert.match(androidJob, /-PBUILD="\$\{BUILD\}"/);
assert.match(androidJob, /java-version: "21"/);
assert.match(workflow, /android\/app\/build\/outputs\/apk\/release\/app-release\.apk/);
assert.match(androidBuildGradle, /signingConfig signingConfigs\.debug/);

for (const secret of [
  "ANDROID_RELEASE_KEYSTORE_BASE64",
  "ANDROID_RELEASE_KEYSTORE_PASSWORD",
  "ANDROID_RELEASE_KEY_ALIAS",
  "ANDROID_RELEASE_KEY_PASSWORD",
  "ANDROID_RELEASE_CERT_SHA256"
]) {
  assert.match(androidJob, new RegExp(`secrets\\.${secret}`));
}

assert.match(androidJob, /\$\{RUNNER_TEMP\}\/ai-knowledge-release\.keystore/);
assert.match(androidJob, /base64 --decode/);
assert.match(androidJob, /chmod 600/);
assert.match(androidJob, /keytool -list/);
assert.match(androidJob, /-storepass "\$\{ANDROID_RELEASE_KEYSTORE_PASSWORD\}"/);
assert.match(androidJob, /-alias "\$\{ANDROID_RELEASE_KEY_ALIAS\}"/);
assert.match(androidJob, /-Pandroid\.injected\.signing\.store\.password="\$\{ANDROID_RELEASE_KEYSTORE_PASSWORD\}"/);
assert.match(androidJob, /-Pandroid\.injected\.signing\.key\.alias="\$\{ANDROID_RELEASE_KEY_ALIAS\}"/);
assert.match(androidJob, /-Pandroid\.injected\.signing\.key\.password="\$\{ANDROID_RELEASE_KEY_PASSWORD\}"/);
assert.doesNotMatch(workflow, /-storepass\s+android\b/);
assert.doesNotMatch(workflow, /-keypass\s+android\b/);
assert.doesNotMatch(workflow, /androiddebugkey/);
assert.doesNotMatch(workflow, /2a010b24419a9cd7847784bf640e34a0d48caa39e295e16091b0373ed089a9b7/i);
assert.doesNotMatch(workflow, /actions\/cache@v4[\s\S]*debug\.keystore/);
assert.doesNotMatch(androidBuildGradle, /KEYSTORE_/);

assert.match(androidJob, /Verify signed APK/);
assert.match(androidJob, /apksigner/);
assert.match(androidJob, /verify --verbose/);
assert.match(androidJob, /keytool -printcert -jarfile/);
assert.match(androidJob, /--print-certs/);
assert.match(androidJob, /Signed release APK was not generated/);
assert.doesNotMatch(workflow, /app-release-unsigned\.apk/);
assert.match(workflow, /apk\/ai-knowledge-chat-latest\.apk/);
assert.match(workflow, /Collected Android APK is empty or missing/);
assert.match(workflow, /actions\/upload-artifact@v4[\s\S]*name: apk/);
assert.match(androidJob, /\n    needs: build-web/);
assert.doesNotMatch(androidJob, /\n\s+if:/);
assert.doesNotMatch(androidJob, /continue-on-error:\s*true/);

assert.equal(packageJson.scripts["app:windows"], "powershell -ExecutionPolicy Bypass -File scripts/build-windows-exe.ps1");
assert.match(windowsJob, /pnpm run app:windows/);
assert.match(windowsPowerShell, /"--win",\s*\r?\n\s*"portable"/);
assert.match(windowsPowerShell, /--config\.extraMetadata\.version/);
assert.match(windowsPowerShell, /-MaxAttempts 3/);
assert.match(windowsPowerShell, /dist-app\/windows/);
assert.match(windowsPowerShell, /ai-knowledge-chat\.exe/);
assert.doesNotMatch(windowsPowerShell, /sync-version\.mjs\s+--package/);
assert.match(workflow, /exe\/ai-knowledge-chat-latest\.exe/);
assert.match(workflow, /actions\/upload-artifact@v4[\s\S]*name: exe/);
assert.match(windowsJob, /\n    needs: build-web/);
assert.doesNotMatch(windowsJob, /\n\s+if:/);
assert.doesNotMatch(windowsJob, /continue-on-error:\s*true/);

assert.match(workflow, /Download APK/);
assert.match(workflow, /name: apk/);
assert.match(workflow, /Download EXE/);
assert.match(workflow, /name: exe/);
assert.match(workflow, /Verify APK and EXE assets/);
assert.match(workflow, /Android APK artifact is missing/);
assert.match(releaseJob, /Checking APK signature/);
assert.match(releaseJob, /Checking APK certificate/);
assert.match(releaseJob, /keytool -printcert -jarfile/);
assert.match(releaseJob, /--print-certs/);
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

for (const source of [workflow, androidBuildScript, androidPowerShell, windowsPowerShell]) {
  assert.doesNotMatch(source, /\brm\s+-rf\b/i);
  assert.doesNotMatch(source, /Remove-Item[^\r\n]*-Recurse/i);
  assert.doesNotMatch(source, /\bgit\s+clean\b/i);
}

assert.doesNotMatch(workflow, /prisma\s+migrate/i);
assert.doesNotMatch(workflow, /DATABASE_URL/);
assert.doesNotMatch(workflow, /schema\.prisma/);
assert.doesNotMatch(workflow, /app\/workspace\/ingest/);
assert.doesNotMatch(workflow, /app\/\(user\)\/chat-ui/);
assert.doesNotMatch(workflow, /api\/auth/);
assert.doesNotMatch(workflow, /license/i);

console.log("CI/CD automation workflow tests passed.");
