import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function listFiles(directory: string): string[] {
  const absolute = path.join(root, directory);
  if (!existsSync(absolute)) {
    return [];
  }

  return readdirSync(absolute).flatMap((entry) => {
    const fullPath = path.join(absolute, entry);
    const relativePath = path.join(directory, entry);
    return statSync(fullPath).isDirectory() ? listFiles(relativePath) : [relativePath];
  });
}

const userIosConfig = read("capacitor.ios.user.config.ts");
assert.match(userIosConfig, /appId:\s*"com\.aiknowledge\.chat"/);
assert.match(userIosConfig, /appName:\s*"AI知识库助手"/);
assert.match(userIosConfig, /webDir:\s*"app-shell"/);
assert.match(userIosConfig, /https:\/\/stately-sawine-1efd4d\.netlify\.app\/chat-ui/);
assert.match(userIosConfig, /cleartext:\s*false/);

const adminIosConfig = read("capacitor.ios.admin.config.ts");
assert.match(adminIosConfig, /appId:\s*"com\.aiknowledge\.admin"/);
assert.match(adminIosConfig, /appName:\s*"AI知识库管理后台"/);
assert.match(adminIosConfig, /webDir:\s*"admin-app-shell"/);
assert.match(adminIosConfig, /https:\/\/stately-sawine-1efd4d\.netlify\.app\/login\?app=admin&next=\/ingest/);
assert.match(adminIosConfig, /cleartext:\s*false/);

const userMacConfig = read("electron-builder.mac.user.yml");
assert.match(userMacConfig, /appId:\s*com\.aiknowledge\.chat\.desktop/);
assert.match(userMacConfig, /productName:\s*AI知识库助手/);
assert.match(userMacConfig, /defaultAppUrl:\s*https:\/\/stately-sawine-1efd4d\.netlify\.app\/chat-ui/);
assert.match(userMacConfig, /artifactName:\s*ai-knowledge-chat\.\$\{ext\}/);

const adminMacConfig = read("electron-builder.mac.admin.yml");
assert.match(adminMacConfig, /appId:\s*com\.aiknowledge\.admin\.desktop/);
assert.match(adminMacConfig, /productName:\s*AI知识库管理后台/);
assert.match(adminMacConfig, /defaultAppUrl:\s*https:\/\/stately-sawine-1efd4d\.netlify\.app\/login\?app=admin&next=\/ingest/);
assert.match(adminMacConfig, /artifactName:\s*ai-knowledge-admin\.\$\{ext\}/);

const packageJson = JSON.parse(read("package.json"));
assert.equal(packageJson.scripts["app:android"], "powershell -ExecutionPolicy Bypass -File scripts/build-android-apk.ps1");
assert.equal(packageJson.scripts["admin:android"], "powershell -ExecutionPolicy Bypass -File scripts/build-admin-android-apk.ps1");
assert.equal(packageJson.scripts["app:windows"], "powershell -ExecutionPolicy Bypass -File scripts/build-windows-exe.ps1");
assert.equal(packageJson.scripts["admin:windows"], "powershell -ExecutionPolicy Bypass -File scripts/build-admin-windows-exe.ps1");
assert.equal(packageJson.scripts["app:ios"], "node scripts/run-macos-packaging-script.cjs ios scripts/build-ios-user-ipa.sh");
assert.equal(packageJson.scripts["admin:ios"], "node scripts/run-macos-packaging-script.cjs ios scripts/build-ios-admin-ipa.sh");
assert.equal(packageJson.scripts["app:macos"], "node scripts/run-macos-packaging-script.cjs macos scripts/build-user-macos-dmg.sh");
assert.equal(packageJson.scripts["admin:macos"], "node scripts/run-macos-packaging-script.cjs macos scripts/build-admin-macos-dmg.sh");
assert.equal(packageJson.scripts["installers:copy"], "powershell -ExecutionPolicy Bypass -File scripts/copy-mobile-desktop-installers-to-public.ps1");
assert.equal(packageJson.devDependencies["@capacitor/ios"], "^8.4.0");

const macosScriptRunner = read("scripts/run-macos-packaging-script.cjs");
assert.match(macosScriptRunner, /process\.platform !== "darwin"/);
assert.match(macosScriptRunner, /iOS IPA 需要在 macOS \+ Xcode 环境下打包。/);
assert.match(macosScriptRunner, /macOS DMG 需要在 macOS 环境打包。/);
assert.match(macosScriptRunner, /spawnSync\("bash"/);

for (const script of ["scripts/build-ios-user-ipa.sh", "scripts/build-ios-admin-ipa.sh"]) {
  const source = read(script);
  assert.match(source, /iOS IPA 需要在 macOS \+ Xcode 环境下打包。/);
  assert.match(source, /npx cap sync ios --config/);
  assert.match(source, /APPLE_TEAM_ID/);
  assert.doesNotMatch(source, /touch\s+.*\.ipa/);
}

for (const script of ["scripts/build-user-macos-dmg.sh", "scripts/build-admin-macos-dmg.sh"]) {
  const source = read(script);
  assert.match(source, /macOS DMG 需要在 macOS 环境打包。/);
  assert.match(source, /electron-builder --config electron-builder\.mac\./);
  assert.doesNotMatch(source, /touch\s+.*\.dmg/);
}

for (const script of [
  "scripts/upload-user-macos-release.sh",
  "scripts/upload-admin-macos-release.sh",
  "scripts/upload-user-ios-release.sh",
  "scripts/upload-admin-ios-release.sh"
]) {
  const source = read(script);
  assert.match(source, /文件不存在，未上传/);
  assert.match(source, /gh release upload/);
  assert.doesNotMatch(source, /touch\s+.*\.(ipa|dmg)/);
}

const pages = [
  read("public/user-download.html"),
  read("public/admin-download.html"),
  read("app/download/page.tsx"),
  read("app/admin-download/page.tsx")
];

for (const page of pages) {
  assert.doesNotMatch(page, /href=["'][^"']+\.(ipa|dmg)(?:["'?])/i);
  assert.match(page, /APK/);
  assert.match(page, /EXE/);
  assert.match(page, /iOS|iPhone|IPA/);
  assert.match(page, /macOS|DMG/);
}

assert.match(read("public/user-download.html"), /https:\/\/stately-sawine-1efd4d\.netlify\.app\/chat-ui/);
assert.match(read("public/admin-download.html"), /https:\/\/stately-sawine-1efd4d\.netlify\.app\/login\?app=admin&amp;next=\/ingest/);
assert.match(read("app/admin-download/page.tsx"), /login\?app=admin&next=\/ingest/);

const copyScript = read("scripts/copy-mobile-desktop-installers-to-public.ps1");
assert.match(copyScript, /public\/downloads/);
assert.match(copyScript, /ai-knowledge-chat-latest\.apk/);
assert.match(copyScript, /ai-knowledge-admin-latest\.apk/);
assert.match(copyScript, /ai-knowledge-chat-latest\.ipa/);
assert.match(copyScript, /ai-knowledge-admin-latest\.dmg/);
assert.match(copyScript, /larger than 100MB/);

const schema = read("prisma/schema.prisma");
assert.doesNotMatch(schema, /aiknowledge\.chat|aiknowledge\.admin|ai-knowledge-chat|ai-knowledge-admin/);

const migrationFiles = listFiles("prisma/migrations");
assert.equal(
  migrationFiles.filter((file) => /ios|macos|dmg|ipa|packaging/i.test(file)).length,
  0
);

const adminApiFiles = listFiles("app/api/admin");
for (const file of adminApiFiles) {
  const source = read(file);
  assert.doesNotMatch(source, /build-ios|macos|dmg|ipa|capacitor\.ios/i);
}

const authFiles = [...listFiles("app/api/auth"), ...listFiles("app/api/license")];
for (const file of authFiles) {
  const source = read(file);
  assert.doesNotMatch(source, /build-ios|macos|dmg|ipa|capacitor\.ios/i);
}

console.log("mobile-desktop packaging tests passed");
