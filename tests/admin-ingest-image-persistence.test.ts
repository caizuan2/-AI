import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createUploadState,
  persistAdminIngestUploadImages,
  stripUploadRuntimeFields
} from "../lib/enterprise/ingest-client";

async function main() {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "admin-ingest-images-"));
  process.env.ADMIN_INGEST_IMAGE_DIR = temporaryRoot;

  try {
    const {
      buildAdminIngestImageUrl,
      readAdminIngestImage,
      saveAdminIngestImage
    } = await import("../lib/enterprise/admin-ingest-image-store");
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const firstSave = await saveAdminIngestImage({
      ownerUserId: "admin-1",
      fileName: "wechat.png",
      mimeType: "image/png",
      bytes: imageBytes
    });
    const secondSave = await saveAdminIngestImage({
      ownerUserId: "admin-1",
      fileName: "renamed.png",
      mimeType: "image/png",
      bytes: imageBytes
    });
    const restored = await readAdminIngestImage({
      ownerUserId: "admin-1",
      imageId: firstSave.imageId
    });

    assert.equal(firstSave.imageId, secondSave.imageId, "相同图片应按内容哈希复用永久文件。");
    assert.deepEqual(Array.from(restored.bytes), Array.from(imageBytes));
    assert.equal(restored.contentType, "image/png");
    assert.match(
      buildAdminIngestImageUrl(firstSave.imageId),
      /^\/api\/admin\/ingest-images\?id=[a-f0-9]{64}\.png$/
    );
    await assert.rejects(
      () => readAdminIngestImage({
        ownerUserId: "admin-2",
        imageId: firstSave.imageId
      }),
      /图片不存在或已失效/,
      "不同投喂端账号不能读取其他账号的图片。"
    );
  } finally {
    delete process.env.ADMIN_INGEST_IMAGE_DIR;
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  const file = new File(["image"], "wechat.jpg", { type: "image/jpeg" });
  const upload = createUploadState(file, { platform: "web" });
  const originalFetch = globalThis.fetch;
  let uploadCalls = 0;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    uploadCalls += 1;
    assert.equal(String(input), "/api/admin/ingest-images");
    assert.equal(init?.method, "POST");
    assert.ok(init?.body instanceof FormData);

    return new Response(JSON.stringify({
      ok: true,
      data: {
        imageId: `${"a".repeat(64)}.jpg`,
        imageUrl: `/api/admin/ingest-images?id=${"a".repeat(64)}.jpg`,
        contentType: "image/jpeg",
        sizeBytes: file.size
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const [persisted] = await persistAdminIngestUploadImages([upload]);
    const historyAttachment = stripUploadRuntimeFields(persisted);

    assert.equal(uploadCalls, 1);
    assert.equal(persisted.persistentUrl, `/api/admin/ingest-images?id=${"a".repeat(64)}.jpg`);
    assert.equal(historyAttachment.previewUrl, historyAttachment.persistentUrl);
    assert.equal("rawFile" in historyAttachment, false);

    await persistAdminIngestUploadImages([persisted]);
    assert.equal(uploadCalls, 1, "已经永久保存的图片不能重复上传。");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const strippedTemporaryImage = stripUploadRuntimeFields({
    ...upload,
    previewUrl: "blob:temporary-image"
  });

  assert.equal(
    strippedTemporaryImage.previewUrl,
    undefined,
    "临时 blob 地址不能写入跨刷新会话历史。"
  );

  const [
    previewSource,
    shellSource,
    modeToggleSource,
    routeSource,
    storeSource
  ] = await Promise.all([
    readFile("components/enterprise-admin/IngestAttachmentPreview.tsx", "utf8"),
    readFile("components/enterprise-admin/IngestChatGPTShell.tsx", "utf8"),
    readFile("components/enterprise-admin/IngestModeToggle.tsx", "utf8"),
    readFile("app/api/admin/ingest-images/route.ts", "utf8"),
    readFile("lib/enterprise/admin-ingest-image-store.ts", "utf8")
  ]);

  assert.match(previewSource, /if \(imageOnly && isImage\)/);
  assert.match(previewSource, /const imageUrl = file\.persistentUrl \|\| file\.previewUrl/);
  assert.match(previewSource, /aria-label="移除图片"/);
  assert.match(shellSource, /files=\{message\.attachments\} compact imageOnly/);
  assert.match(shellSource, /files=\{uploadedFiles\} onRemove=\{onRemoveUpload\} imageOnly/);
  assert.match(modeToggleSource, /platformContext\.platform === "web"/);
  assert.match(modeToggleSource, /await persistAdminIngestUploadImages\(composerUploads\)/);
  assert.ok(
    modeToggleSource.indexOf("await persistAdminIngestUploadImages(composerUploads)")
      < modeToggleSource.indexOf("attachments: draftAttachments"),
    "图片永久地址必须在消息写入历史前生成。"
  );
  assert.match(routeSource, /requireAdminIngestActor/);
  assert.match(routeSource, /Cache-Control": "private, max-age=31536000, immutable"/);
  assert.match(storeSource, /\/var\/www\/ai-knowledge-shared\/admin-ingest\/images/);
  const imageOnlyBranchStart = previewSource.indexOf("if (imageOnly && isImage)");
  const imageOnlyBranchEnd = previewSource.indexOf("\n        return (", imageOnlyBranchStart);

  assert.ok(imageOnlyBranchStart >= 0 && imageOnlyBranchEnd > imageOnlyBranchStart);
  assert.doesNotMatch(
    previewSource.slice(imageOnlyBranchStart, imageOnlyBranchEnd),
    /fileName|formatFileSize|statusLabel/
  );

  console.log("Admin ingest image-only persistence tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
