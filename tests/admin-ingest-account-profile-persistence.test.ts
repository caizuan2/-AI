import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

async function main() {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "admin-ingest-profiles-"));
  const previousProfileDir = process.env.ADMIN_INGEST_PROFILE_DIR;
  process.env.ADMIN_INGEST_PROFILE_DIR = temporaryRoot;

  try {
    const {
      readAdminIngestAccountProfile,
      writeAdminIngestAccountAvatar,
      writeAdminIngestAccountName
    } = await import("../lib/enterprise/admin-ingest-account-profile-store");
    const avatarImageId = `${"a".repeat(64)}.png`;
    const namedProfile = await writeAdminIngestAccountName({
      ownerUserId: "admin-profile-1",
      name: "蔡钻"
    });

    assert.equal(namedProfile.name, "蔡钻");
    assert.equal(namedProfile.avatarImageId, null);

    const completedProfile = await writeAdminIngestAccountAvatar({
      ownerUserId: "admin-profile-1",
      avatarImageId
    });
    const restoredProfile = await readAdminIngestAccountProfile("admin-profile-1");
    const otherAccountProfile = await readAdminIngestAccountProfile("admin-profile-2");

    assert.equal(completedProfile.name, "蔡钻", "保存头像时必须保留已经保存的名称。");
    assert.equal(restoredProfile.name, "蔡钻");
    assert.equal(restoredProfile.avatarImageId, avatarImageId);
    assert.equal(otherAccountProfile.name, null, "投喂端账号资料必须按账号隔离。");
    assert.equal(otherAccountProfile.avatarImageId, null);
    await assert.rejects(
      () => writeAdminIngestAccountName({
        ownerUserId: "admin-profile-1",
        name: "单"
      }),
      /名称长度需要在 2 到 20 个字符之间/
    );
  } finally {
    if (previousProfileDir === undefined) {
      delete process.env.ADMIN_INGEST_PROFILE_DIR;
    } else {
      process.env.ADMIN_INGEST_PROFILE_DIR = previousProfileDir;
    }
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  const [
    storeSource,
    routeSource,
    clientSource,
    modeSource,
    settingsSource
  ] = await Promise.all([
    readFile("lib/enterprise/admin-ingest-account-profile-store.ts", "utf8"),
    readFile("app/api/admin/ingest-profile/route.ts", "utf8"),
    readFile("lib/enterprise/admin-ingest-account-profile-client.ts", "utf8"),
    readFile("components/enterprise-admin/IngestModeToggle.tsx", "utf8"),
    readFile("components/enterprise-admin/IngestSettingsPanel.tsx", "utf8")
  ]);

  assert.match(
    storeSource,
    /\/var\/www\/ai-knowledge-shared\/admin-ingest\/profiles/,
    "生产头像与名称元数据必须保存在跨版本共享目录。"
  );
  assert.match(routeSource, /requireAdminIngestChatActor/);
  assert.match(routeSource, /saveAdminIngestImage/);
  assert.match(routeSource, /writeAdminIngestAccountAvatar/);
  assert.match(routeSource, /writeAdminIngestAccountName/);
  assert.match(clientSource, /\/api\/admin\/ingest-profile/);
  assert.match(clientSource, /legacyAdminIngestAvatarToFile/);
  assert.match(modeSource, /loadAdminIngestAccountProfile/);
  assert.match(modeSource, /saveAdminIngestAccountAvatar/);
  assert.match(modeSource, /saveAdminIngestAccountName/);
  assert.match(modeSource, /legacyAdminIngestAvatarToFile/);
  assert.match(settingsSource, /await onAvatarChange\(file\)/);
  assert.match(settingsSource, /await onAppNameChange\(normalizedName\)/);
  assert.match(settingsSource, /头像已永久保存/);
  assert.match(settingsSource, /名称已永久保存/);

  console.log("admin ingest account profile persistence tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
