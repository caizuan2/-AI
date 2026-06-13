import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const fixAndroidEnv = readFileSync("scripts/fix-android-env.ps1", "utf8");
const buildAll = readFileSync("scripts/build-all.ps1", "utf8");

assert.equal(
  packageJson.scripts["fix:all"],
  "powershell -ExecutionPolicy Bypass -File scripts/build-all.ps1"
);
assert.equal(
  packageJson.scripts["build:all"],
  "powershell -ExecutionPolicy Bypass -File scripts/build-all.ps1"
);

assert.ok(existsSync("scripts/fix-android-env.ps1"));
assert.ok(existsSync("scripts/build-all.ps1"));

assert.match(fixAndroidEnv, /ANDROID_HOME/);
assert.match(fixAndroidEnv, /ANDROID_SDK_ROOT/);
assert.match(fixAndroidEnv, /local\.properties/);
assert.match(fixAndroidEnv, /sdk\.dir=\$sdkDir/);
assert.match(fixAndroidEnv, /SetEnvironmentVariable\("ANDROID_HOME"/);
assert.match(fixAndroidEnv, /SetEnvironmentVariable\("ANDROID_SDK_ROOT"/);
assert.match(fixAndroidEnv, /platform-tools/);
assert.match(fixAndroidEnv, /npx" -Arguments @\("cap", "sync", "android"\)/);
assert.doesNotMatch(fixAndroidEnv, /prisma|migrate|DATABASE_URL|login|license/i);

assert.match(buildAll, /fix-android-env\.ps1/);
assert.match(buildAll, /Get-AppVersionDefaults/);
assert.match(buildAll, /APP_VERSION/);
assert.match(buildAll, /APP_BUILD/);
assert.match(buildAll, /build-android-apk\.ps1/);
assert.match(buildAll, /Invoke-NpmScript "admin:android"/);
assert.match(buildAll, /Invoke-NpmScript "app:windows"/);
assert.match(buildAll, /Invoke-NpmScript "admin:windows"/);
assert.match(buildAll, /Invoke-NpmScript "installers:copy"/);
assert.match(buildAll, /release-all-installers\.ps1/);
assert.match(buildAll, /"-ManifestOnly"/);
assert.doesNotMatch(buildAll, /git\s+(?:add|commit|push)/);
assert.doesNotMatch(buildAll, /prisma|migrate|DATABASE_URL|register|license/i);

const prismaSchema = readFileSync("prisma/schema.prisma", "utf8");
assert.doesNotMatch(prismaSchema, /fix-android-env|build-all|ANDROID_HOME|ANDROID_SDK_ROOT/i);

if (existsSync("prisma/migrations")) {
  const packagingMigrations = readdirSync("prisma/migrations").filter((name) =>
    /android-env|build-all|packaging-env|one-click-build/i.test(name)
  );
  assert.deepEqual(packagingMigrations, []);
}

console.log("Build-all script tests passed.");
