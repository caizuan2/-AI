import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import {
  bundledAdminIngestImageManifest,
  getAdminIngestImageRotationKey,
  parseAdminIngestImageManifest,
  selectAdminIngestStableImage
} from "../lib/enterprise/admin-ingest-image-library";

test("bundled image library keeps all supplied assets valid and optimized", async () => {
  assert.equal(bundledAdminIngestImageManifest.assets.length, 21);
  assert.deepEqual(
    Object.keys(bundledAdminIngestImageManifest.pools).sort(),
    ["agent:default", "rail:chat", "rail:experts"]
  );

  for (const asset of bundledAdminIngestImageManifest.assets) {
    const filePath = `public${asset.src}`;
    assert.equal(existsSync(filePath), true, `${asset.id} should exist`);
    const metadata = await sharp(filePath).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 512);
    assert.equal(metadata.height, 512);
  }
});

test("stable selection remains fixed for a slot and day across render order", () => {
  const rotationKey = "2026-07-28";
  const first = selectAdminIngestStableImage(
    bundledAdminIngestImageManifest,
    "agent:career-mentor",
    rotationKey
  );
  const second = selectAdminIngestStableImage(
    bundledAdminIngestImageManifest,
    "agent:career-mentor",
    rotationKey
  );

  assert.ok(first);
  assert.deepEqual(second, first);
  assert.ok(selectAdminIngestStableImage(
    bundledAdminIngestImageManifest,
    "rail:chat",
    rotationKey
  ));
  assert.ok(selectAdminIngestStableImage(
    bundledAdminIngestImageManifest,
    "rail:experts",
    rotationKey
  ));
});

test("exact agent pools override the generic pool without changing agent data", () => {
  const firstAsset = bundledAdminIngestImageManifest.assets[0];
  const manifest = {
    ...bundledAdminIngestImageManifest,
    pools: {
      ...bundledAdminIngestImageManifest.pools,
      "agent:three-life": [firstAsset.id],
    },
  };

  assert.equal(
    selectAdminIngestStableImage(manifest, "agent:three-life", "2026-07-28")?.id,
    firstAsset.id
  );
  assert.ok(selectAdminIngestStableImage(manifest, "agent:another", "2026-07-28"));
});

test("manifest validation rejects external and traversal image sources", () => {
  const unsafeExternal = {
    ...bundledAdminIngestImageManifest,
    assets: [{ id: "unsafe", src: "https://example.com/unsafe.webp", enabled: true }],
    pools: { "agent:default": ["unsafe"] },
  };
  const unsafeTraversal = {
    ...unsafeExternal,
    assets: [{ id: "unsafe", src: "/admin-ingest-media/library/../unsafe.webp", enabled: true }],
  };

  assert.equal(parseAdminIngestImageManifest(unsafeExternal), null);
  assert.equal(parseAdminIngestImageManifest(unsafeTraversal), null);
});

test("rotation key uses the Asia Shanghai calendar day", () => {
  assert.equal(
    getAdminIngestImageRotationKey(Date.parse("2026-07-27T16:00:00.000Z")),
    "2026-07-28"
  );
});

test("admin ingest surfaces use the shared library without touching model routes", () => {
  const shell = readFileSync("components/enterprise-admin/IngestChatGPTShell.tsx", "utf8");
  const avatar = readFileSync("components/enterprise-admin/IngestAgentAvatar.tsx", "utf8");
  const exeList = readFileSync("components/enterprise-admin/IngestEXEAgentList.tsx", "utf8");
  const exeSidebar = readFileSync("components/enterprise-admin/IngestEXESidebar.tsx", "utf8");

  assert.match(shell, /slotKey=\{`rail:\$\{item\.key\}`\}/);
  assert.match(shell, /assetSlotKey=\{`agent:\$\{agent\.id\}`\}/);
  assert.match(shell, /assetSlotKey=\{`agent:\$\{messageAgent\.id\}`\}/);
  assert.match(avatar, /IngestStableLibraryImage/);
  assert.match(exeList, /assetSlotKey=\{`agent:\$\{agent\.id\}`\}/);
  assert.match(exeSidebar, /slotKey=\{`rail:\$\{railKey\}`\}/);
  assert.doesNotMatch(shell, /doubao-ingest-client|deepseek-ingest-client/);
});
