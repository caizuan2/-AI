import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  const [
    modeToggle,
    fileParser,
    ingestClient,
    parseRoute,
    shell,
    exeInput
  ] = await Promise.all([
    readFile("components/enterprise-admin/IngestModeToggle.tsx", "utf8"),
    readFile("lib/enterprise/ingest-file-parser.ts", "utf8"),
    readFile("lib/enterprise/ingest-client.ts", "utf8"),
    readFile("app/api/admin/kb/ingest/files/parse/route.ts", "utf8"),
    readFile("components/enterprise-admin/IngestChatGPTShell.tsx", "utf8"),
    readFile("components/enterprise-admin/IngestEXEInputBar.tsx", "utf8")
  ]);

  const imagePreparationStart = modeToggle.indexOf(
    "if (composerUploads.some((file) => file.isImage"
  );
  const attachmentPreparationStart = modeToggle.indexOf(
    "await prepareAdminIngestAttachments({",
    imagePreparationStart
  );
  const clearComposerStart = modeToggle.indexOf(
    'setInput("");',
    imagePreparationStart
  );
  const clearUploadsStart = modeToggle.indexOf(
    "setUploadedFiles([]);",
    imagePreparationStart
  );

  assert.ok(imagePreparationStart >= 0);
  assert.ok(attachmentPreparationStart > imagePreparationStart);
  assert.ok(clearComposerStart > imagePreparationStart);
  assert.ok(
    clearComposerStart < attachmentPreparationStart,
    "发送已通过校验后，输入框必须在图片永久保存网络等待前立即清空。"
  );
  assert.ok(
    clearUploadsStart > clearComposerStart && clearUploadsStart < attachmentPreparationStart,
    "待发送附件必须与输入框一起在附件准备网络等待前清空。"
  );
  const attachmentPreparationResultStart = modeToggle.indexOf(
    "composerUploads = preparation.persistedUploads;",
    attachmentPreparationStart
  );
  assert.ok(attachmentPreparationResultStart > attachmentPreparationStart);
  const attachmentPreparation = modeToggle.slice(attachmentPreparationStart, attachmentPreparationResultStart);
  assert.match(attachmentPreparation, /uploads: composerUploads/);
  assert.match(attachmentPreparation, /controller: imagePersistenceController/);
  assert.match(
    attachmentPreparation,
    /persist: \(files, signal\) => persistAdminIngestUploadImages\(files, requestHistoryScope, signal\)/,
    "附件准备必须仍接入真实永久保存函数，并传递发送时账户范围和取消信号。"
  );
  assert.match(
    modeToggle,
    /preparationAbortControllerByConversationRef[\s\S]*imagePersistenceController/
  );

  const cancelHandler = modeToggle.slice(
    modeToggle.indexOf("function handleCancelIngest()"),
    modeToggle.indexOf("async function handleSave()")
  );

  assert.match(cancelHandler, /preparationController\.abort/);
  assert.match(cancelHandler, /setInput\(""\)/);
  assert.doesNotMatch(
    cancelHandler,
    /conversationLastInputByIdRef|lastSubmittedMessage/,
    "用户停止后不能把上一次提交的正文重新放回输入框。"
  );

  assert.match(
    ingestClient,
    /formData\.append\(\s*"wechatOutputMode",\s*file\.wechatOutputMode \?\? "reply_script"/
  );
  assert.match(parseRoute, /formData\.get\("wechatOutputMode"\)/);
  assert.ok(
    fileParser.indexOf("const visionResult = await extractChatImageText")
      < fileParser.indexOf(
        "const result = await extractAdminIngestWechatConversationText"
      ),
    "微信长截图应先走并发视觉识别，只有视觉识别失败时才回退本地串行 OCR。"
  );
  assert.match(fileParser, /const maxTailHeight = 6_000/);
  assert.match(
    fileParser,
    /input\.wechatOutputMode === "reply_script"[\s\S]*prepareWechatReplyScriptVisionBuffer/
  );

  assert.doesNotMatch(
    shell,
    /(?:cameraInputRef|imageInputRef|documentInputRef)\.current\?\.click/
  );
  assert.match(
    shell,
    /className="absolute inset-0 h-full w-full cursor-pointer opacity-0"/
  );
  assert.doesNotMatch(exeInput, /fileInputRef\.current\?\.click/);
  assert.match(
    exeInput,
    /aria-label="附件"[\s\S]*className="absolute inset-0 h-full w-full cursor-pointer opacity-0"/
  );

  console.log("Admin ingest runtime stability tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
