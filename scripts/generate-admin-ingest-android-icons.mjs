import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourcePath = path.join(
  projectRoot,
  "assets",
  "admin-ingest",
  "web-logo.png"
);
const outputRoot = path.join(
  projectRoot,
  "assets",
  "admin-ingest",
  "android-icons"
);

const densitySpecs = [
  { density: "mdpi", launcherSize: 48 },
  { density: "hdpi", launcherSize: 72 },
  { density: "xhdpi", launcherSize: 96 },
  { density: "xxhdpi", launcherSize: 144 },
  { density: "xxxhdpi", launcherSize: 192 }
];

const LEGACY_LOGO_RATIO = 0.78;
const ADAPTIVE_FOREGROUND_SCALE = 2.25;
const ADAPTIVE_LOGO_RATIO = 0.7;

async function renderLogo(source, canvasSize, logoRatio, background) {
  const logoSize = Math.max(1, Math.round(canvasSize * logoRatio));
  const resizedLogo = await sharp(source)
    .trim()
    .resize({
      width: logoSize,
      height: logoSize,
      fit: "inside",
      withoutEnlargement: true
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background
    }
  })
    .composite([{ input: resizedLogo, gravity: "centre" }])
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true
    })
    .toBuffer();
}

async function buildDensityAssets(source, launcherSize) {
  const foregroundSize = Math.round(
    launcherSize * ADAPTIVE_FOREGROUND_SCALE
  );
  const legacy = await renderLogo(
    source,
    launcherSize,
    LEGACY_LOGO_RATIO,
    { r: 255, g: 255, b: 255, alpha: 1 }
  );
  const foreground = await renderLogo(
    source,
    foregroundSize,
    ADAPTIVE_LOGO_RATIO,
    { r: 255, g: 255, b: 255, alpha: 0 }
  );

  return {
    "ic_launcher.png": legacy,
    "ic_launcher_round.png": legacy,
    "ic_launcher_foreground.png": foreground
  };
}

async function writeOrCheckAsset(outputPath, expected, checkOnly) {
  if (checkOnly) {
    const actual = await readFile(outputPath);
    assert.equal(
      actual.equals(expected),
      true,
      `Admin Android launcher icon is stale: ${path.relative(projectRoot, outputPath)}`
    );
    return;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, expected);
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const source = await readFile(sourcePath);

  for (const { density, launcherSize } of densitySpecs) {
    const assets = await buildDensityAssets(source, launcherSize);
    const densityDirectory = path.join(outputRoot, `mipmap-${density}`);

    for (const [fileName, bytes] of Object.entries(assets)) {
      await writeOrCheckAsset(
        path.join(densityDirectory, fileName),
        bytes,
        checkOnly
      );
    }
  }

  console.log(
    checkOnly
      ? "Admin Android launcher icons match the current admin Web logo."
      : "Admin Android launcher icons generated from the current admin Web logo."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
