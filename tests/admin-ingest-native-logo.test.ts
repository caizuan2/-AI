import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const generationOutput = execFileSync(
  process.execPath,
  ["scripts/generate-admin-ingest-android-icons.mjs", "--check"],
  { encoding: "utf8" }
);

assert.match(
  generationOutput,
  /launcher icons match the current admin Web logo/
);

const adminBuildScript = readFileSync(
  "scripts/build-admin-android-apk.ps1",
  "utf8"
);
assert.match(
  adminBuildScript,
  /\$AdminIconSourceDir = Join-Path \$Root "assets\/admin-ingest\/android-icons"/
);
assert.match(adminBuildScript, /Backup-AndroidLauncherIcons/);
assert.match(adminBuildScript, /Copy-AdminLauncherIcons/);
assert.match(adminBuildScript, /Restore-AndroidLauncherIcons/);

const adaptiveBackground = readFileSync(
  "android/app/src/main/res/values/ic_launcher_background.xml",
  "utf8"
);
assert.match(adaptiveBackground, /#FFFFFF/i);

const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
for (const density of densities) {
  const adminLauncher = readFileSync(
    `assets/admin-ingest/android-icons/mipmap-${density}/ic_launcher.png`
  );
  const adminRoundLauncher = readFileSync(
    `assets/admin-ingest/android-icons/mipmap-${density}/ic_launcher_round.png`
  );
  const userLauncher = readFileSync(
    `android/app/src/main/res/mipmap-${density}/ic_launcher.png`
  );

  assert.equal(
    adminLauncher.equals(adminRoundLauncher),
    true,
    `${density} legacy and round admin icons must use the same white-background logo.`
  );
  assert.notEqual(
    createHash("sha256").update(adminLauncher).digest("hex"),
    createHash("sha256").update(userLauncher).digest("hex"),
    `${density} admin icon must remain isolated from the frozen user APK icon.`
  );
}

const protectedSources = [
  "lib/ai/deepseek-provider.ts",
  "lib/enterprise/doubao-ingest-client.ts",
  "prisma/schema.prisma"
];
for (const protectedSource of protectedSources) {
  assert.doesNotThrow(() => readFileSync(protectedSource));
}

console.log("admin-ingest native logo tests passed");
