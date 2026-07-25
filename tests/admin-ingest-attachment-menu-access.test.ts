import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isAdminIngestImageAttachment } from "../lib/enterprise/admin-ingest-attachment-access";

const shell = readFileSync(
  "components/enterprise-admin/IngestChatGPTShell.tsx",
  "utf8"
);
const modeToggle = readFileSync(
  "components/enterprise-admin/IngestModeToggle.tsx",
  "utf8"
);
const parseRoute = readFileSync(
  "app/api/admin/kb/ingest/files/parse/route.ts",
  "utf8"
);
const urlRoute = readFileSync(
  "app/api/admin/kb/ingest/url/route.ts",
  "utf8"
);
const gptRoute = readFileSync(
  "app/api/admin/kb/ingest/gpt/route.ts",
  "utf8"
);

const menuSource = shell.slice(
  shell.indexOf("const moreToolActions"),
  shell.indexOf("const EMPTY_AGENTS")
);

assert.ok(menuSource.indexOf('label: "相机"') < menuSource.indexOf('label: "图片"'));
assert.ok(menuSource.indexOf('label: "图片"') < menuSource.indexOf('label: "文件"'));
assert.ok(menuSource.indexOf('label: "文件"') < menuSource.indexOf('label: "网址"'));
assert.match(menuSource, /key: "camera"[\s\S]*requiresFullIngestAccess: false/);
assert.match(menuSource, /key: "image"[\s\S]*requiresFullIngestAccess: false/);
assert.match(menuSource, /key: "file"[\s\S]*requiresFullIngestAccess: true/);
assert.match(menuSource, /key: "url"[\s\S]*requiresFullIngestAccess: true/);

assert.match(
  shell,
  /moreToolActions\.filter\(\(action\) => \([\s\S]*canUseFullIngestTools \|\| !action\.requiresFullIngestAccess/
);
assert.match(shell, /rounded-\[28px\][\s\S]*shadow-2xl shadow-slate-200\/80/);
assert.match(shell, /h-11 w-11[\s\S]*rounded-full bg-slate-100 text-slate-950/);
assert.match(shell, /text-base font-semibold text-slate-950/);
assert.match(modeToggle, /canUseFullIngestTools: accessTier === "full_ingest"/);

assert.match(shell, /ref=\{cameraInputRef\}[\s\S]*accept="image\/\*"[\s\S]*capture="environment"/);
assert.match(
  shell,
  /ref=\{cameraInputRef\}[\s\S]*handleFileChange\(event, "wechat_conversation"\)/
);
assert.match(
  shell,
  /ref=\{imageInputRef\}[\s\S]*accept="image\/\*"[\s\S]*multiple[\s\S]*handleFileChange\(event, "wechat_conversation"\)/
);
assert.match(shell, /ref=\{documentInputRef\}[\s\S]*accept="\.pdf,.doc,.docx,.ppt,.pptx,.txt,.md"/);
assert.doesNotMatch(
  shell.slice(shell.indexOf("ref={documentInputRef}"), shell.indexOf("<div className=\"flex items-end gap-2\">")),
  /image\/\*/
);

assert.match(parseRoute, /const chatAccess = await requireAdminIngestChatAccess\(\)/);
assert.match(parseRoute, /accessTier = chatAccess\.access\.accessTier/);
assert.match(
  parseRoute,
  /accessTier !== "full_ingest"[\s\S]*!isAdminIngestImageAttachment\(\{ fileName, mimeType, bytes: buffer \}\)/
);
assert.match(urlRoute, /await requireFullAdminIngestAccess\(\)/);
assert.ok(
  urlRoute.indexOf("await requireFullAdminIngestAccess()")
    < urlRoute.indexOf("input = readRequest(await request.json())"),
  "网址请求必须先校验投喂端权限，再读取并处理请求。"
);
assert.match(
  gptRoute,
  /!hasFullIngestAccess[\s\S]*input\.attachments\.some\(\(attachment\) => !isAdminIngestImageAttachment/
);
assert.match(gptRoute, /INGEST_FULL_ACCESS_REQUIRED|IngestFullAccessRequiredError/);

assert.equal(isAdminIngestImageAttachment({
  fileName: "wechat.jpg",
  mimeType: "application/octet-stream",
  bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xdb])
}), true);
assert.equal(isAdminIngestImageAttachment({
  fileName: "wechat.png",
  mimeType: "application/octet-stream",
  bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
}), true);
assert.equal(isAdminIngestImageAttachment({
  fileName: "notes.pdf",
  mimeType: "image/jpeg",
  bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46])
}), false, "服务端必须以真实文件签名阻止伪装成图片的文档。");
assert.equal(isAdminIngestImageAttachment({
  fileName: "wechat.webp",
  mimeType: "image/webp"
}), true);
assert.equal(isAdminIngestImageAttachment({
  fileName: "notes.docx",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
}), false);

console.log("Admin ingest attachment menu and card-tier access tests passed.");
