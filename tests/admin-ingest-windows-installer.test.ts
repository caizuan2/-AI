import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const builderConfig = readFileSync(
  "electron/admin-ingest/electron-builder.yml",
  "utf8"
);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const buildScript = readFileSync(
  "scripts/build/build-admin-ingest-exe.ps1",
  "utf8"
);
const manifestWriter = readFileSync(
  "scripts/release/write-release-manifest.mjs",
  "utf8"
);
const ciVerifier = readFileSync(
  "scripts/ci/verify-web-apk-exe-sync.mjs",
  "utf8"
);
const releaseVerifier = readFileSync(
  "scripts/release/verify-release-sync.mjs",
  "utf8"
);
const downloadPage = readFileSync("app/admin-download/page.tsx", "utf8");
const exeWorkflow = readFileSync(
  ".github/workflows/admin-ingest-build-exe.yml",
  "utf8"
);

assert.match(builderConfig, /target:\s*nsis/);
assert.doesNotMatch(builderConfig, /-\s*portable/);
assert.match(builderConfig, /electronVersion:\s*42\.3\.3/);
assert.match(builderConfig, /artifactName:\s*"admin-ingest-setup-\$\{version\}\.\$\{ext\}"/);
assert.match(builderConfig, /oneClick:\s*false/);
assert.match(builderConfig, /allowToChangeInstallationDirectory:\s*true/);
assert.match(builderConfig, /createDesktopShortcut:\s*always/);
assert.match(builderConfig, /createStartMenuShortcut:\s*true/);

assert.match(
  packageJson.scripts["admin-ingest:desktop:build"],
  /--win nsis --publish never$/
);
assert.doesNotMatch(packageJson.scripts["admin-ingest:desktop:build"], /portable/);

assert.match(buildScript, /--win nsis --publish never/);
assert.doesNotMatch(buildScript, /--win portable/);
assert.match(buildScript, /Find-NsisInstallerOutput/);
assert.match(buildScript, /admin-ingest-setup-\$Version\.exe/);
assert.match(buildScript, /installerType = if \(\$Available\) \{ "nsis" \}/);
assert.match(buildScript, /EXE_NSIS_INSTALLER_NOT_FOUND/);
assert.match(buildScript, /pnpm install --frozen-lockfile/);
assert.match(buildScript, /pnpm exec electron-builder/);
assert.doesNotMatch(buildScript, /npx electron-builder/);
assert.doesNotMatch(buildScript, /npm install --include=dev/);

assert.match(manifestWriter, /installerType:\s*manifest\.installerType \|\| null/);
assert.match(ciVerifier, /exe\.installerType must be nsis/);
assert.match(releaseVerifier, /exe\.installerType must be nsis/);

assert.match(downloadPage, /Windows 安装程序/);
assert.match(downloadPage, /下载完成后直接双击安装，无需解压/);
assert.match(downloadPage, /不需要使用解压软件打开/);

assert.match(exeWorkflow, /artifacts\/admin-ingest\/exe\/admin-ingest\.exe/);
assert.match(exeWorkflow, /PNPM_VERSION:\s*"10\.12\.4"/);
assert.match(exeWorkflow, /uses:\s*pnpm\/action-setup@v4/);
assert.match(exeWorkflow, /pnpm install --frozen-lockfile/);
assert.doesNotMatch(exeWorkflow, /npm install --include=dev/);
assert.doesNotMatch(exeWorkflow, /dist-app\/admin-ingest\/windows\/\*\*\/\*\.exe/);
assert.doesNotMatch(exeWorkflow, /dist-app\/admin-windows\/\*\*\/\*\.exe/);
assert.doesNotMatch(exeWorkflow, /flutter_app\/build\/windows\/\*\*\/\*\.exe/);
assert.doesNotMatch(
  exeWorkflow,
  /src-tauri\/target\/release\/bundle\/\*\*\/\*\.exe/
);

console.log("Admin-ingest Windows NSIS installer tests passed.");
