import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const workflowPath = ".github/workflows/release.yml";

assert.ok(existsSync(workflowPath), "release.yml must exist.");

const workflow = readFileSync(workflowPath, "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.match(workflow, /on:\s*\n\s+push:/);
assert.match(workflow, /branches:\s*\n\s+- main/);
assert.match(workflow, /tags:\s*\n\s+- "v\*"/);
assert.match(workflow, /permissions:[\s\S]*contents: write/);

assert.match(workflow, /actions\/checkout@v4/);
assert.match(workflow, /actions\/setup-node@v4/);
assert.match(workflow, /actions\/setup-java@v4/);
assert.match(workflow, /npm install/);

assert.match(workflow, /npm run build/);
assert.match(workflow, /npm run lint/);
assert.match(workflow, /npm run typecheck/);

assert.match(workflow, /npx cap sync android/);
assert.match(workflow, /\.\/gradlew assembleRelease/);
assert.match(workflow, /android\/app\/build\/outputs\/apk\/release\/app-release\.apk/);
assert.match(workflow, /android\/app\/build\/outputs\/apk\/release\/app-release-unsigned\.apk/);
assert.match(workflow, /actions\/upload-artifact@v4[\s\S]*name: android-apk/);

assert.match(workflow, /electron-builder --win --publish never/);
assert.match(workflow, /ai-knowledge-chat-latest\.apk/);
assert.match(workflow, /dist\/ai-knowledge-chat-latest\.exe/);
assert.match(workflow, /actions\/upload-artifact@v4[\s\S]*name: windows-exe/);

assert.match(workflow, /release-assets\/manifest\/latest\.json/);
for (const field of ["version", "build", "apk_url", "exe_url", "web_url", "updated_at"]) {
  assert.match(workflow, new RegExp(field));
}
assert.match(workflow, /JSON\.parse\(fs\.readFileSync\("release-assets\/manifest\/latest\.json"/);

assert.match(workflow, /gh release create/);
assert.match(workflow, /gh release edit/);
assert.match(workflow, /gh release upload/);
assert.match(workflow, /--clobber/);
assert.match(workflow, /release-assets\/android-apk\/\*\.apk/);
assert.match(workflow, /release-assets\/windows-exe\/\*\.exe/);
assert.match(workflow, /release-assets\/manifest\/latest\.json/);

assert.doesNotMatch(workflow, /NETLIFY_DEPLOY_HOOK_URL/);
assert.doesNotMatch(workflow, /VERCEL_DEPLOY_HOOK_URL/);
assert.doesNotMatch(workflow, /curl -fsS -X POST/);

assert.match(workflow, /GITHUB_REF_TYPE/);
assert.match(workflow, /GITHUB_REF_NAME/);
assert.match(workflow, /GITHUB_RUN_NUMBER/);
assert.match(workflow, /channel="stable"/);
assert.match(workflow, /preview/);
assert.match(workflow, /prerelease="true"/);

assert.equal(packageJson.scripts.lint, "next lint");
assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
assert.equal(packageJson.scripts.build, "next build");

for (const pattern of [
  "dist/",
  "dist-app/",
  "android/app/build/",
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
