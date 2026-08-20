import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  const source = await readFile(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );

  const overlapStart = source.indexOf(
    "const shouldOverlapDeepSeekAttachmentParsing"
  );
  const overlapEnd = source.indexOf(
    'latencyTrace.mark("image_persist_completed"',
    overlapStart
  );
  const overlapSource = source.slice(overlapStart, overlapEnd);

  assert.ok(overlapStart >= 0 && overlapEnd > overlapStart);
  assert.match(
    overlapSource,
    /requestModelOption\.provider === "deepseek-pro"/,
    "图片保存与OCR重叠只能作用于管理员投喂端DeepSeek。"
  );
  assert.doesNotMatch(
    overlapSource,
    /requestModelOption\.provider === "doubao-pro"/,
    "豆包必须继续沿用原有串行路径。"
  );
  assert.match(
    overlapSource,
    /const deepSeekAttachmentProvider = requestModelOption\.provider === "deepseek-flash"[\s\S]*?parseUploadedFilesForGpt\(uploadsBeforePersistence, 2, \{[\s\S]*?modelProvider: deepSeekAttachmentProvider[\s\S]*?strictModelAffinity: true[\s\S]*?pageBatchSize: 4/,
    "DeepSeek并行OCR必须继续使用完整附件和原严格模型亲和配置。"
  );
  assert.match(
    overlapSource,
    /Promise\.all\(\[[\s\S]*?imagePersistencePromise,[\s\S]*?overlappingAttachmentParsePromise[\s\S]*?\]\)/,
    "图片永久保存与OCR必须真正并行等待。"
  );
  assert.match(
    source,
    /const preparedUploads = preparedDeepSeekUploads \?\? await parseUploadedFilesForGpt\(composerUploads/,
    "并行OCR成功后必须直接复用，失败时仍安全回退原解析路径。"
  );
  assert.match(
    overlapSource,
    /imagePersistenceController\.signal\.aborted[\s\S]*?overlappingAttachmentParse\.error instanceof AdminIngestFileParseCancelledError[\s\S]*?overlappingAttachmentParse\.error instanceof DOMException[\s\S]*?overlappingAttachmentParse\.error\.name === "AbortError"/,
    "外层信号、附件解析取消类型及AbortError任一出现都必须终止本轮。"
  );
  assert.match(
    overlapSource,
    /new DOMException\([\s\S]*?"Admin ingest DeepSeek attachment preparation cancelled\."[\s\S]*?"AbortError"/,
    "解析取消必须统一抛出AbortError，不能被当成普通失败后再次顺序OCR。"
  );
  const cancellationGuardIndex = overlapSource.indexOf(
    "imagePersistenceController.signal.aborted"
  );
  const sequentialFallbackIndex = source.indexOf(
    "const preparedUploads = preparedDeepSeekUploads ?? await parseUploadedFilesForGpt"
  );
  assert.ok(cancellationGuardIndex >= 0 && sequentialFallbackIndex > overlapEnd);
  assert.match(
    source,
    /persistedFile\?\.persistentUrl[\s\S]*?previewUrl: persistedFile\.previewUrl,[\s\S]*?persistentUrl: persistedFile\.persistentUrl/,
    "OCR结果必须合并永久图片地址后再写入消息和历史。"
  );

  console.log("admin ingest DeepSeek pre-model overlap tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
