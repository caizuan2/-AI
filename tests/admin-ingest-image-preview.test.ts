import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const previewSource = readFileSync(
  "components/enterprise-admin/IngestAttachmentPreview.tsx",
  "utf8"
);
const sentMessageSource = readFileSync(
  "components/enterprise-admin/IngestChatGPTFileMessage.tsx",
  "utf8"
);
const shellSource = readFileSync(
  "components/enterprise-admin/IngestChatGPTShell.tsx",
  "utf8"
);
const exeInputSource = readFileSync(
  "components/enterprise-admin/IngestEXEInputBar.tsx",
  "utf8"
);

assert.match(previewSource, /enableImagePreview = false/);
assert.match(previewSource, /enableImagePreview\?: boolean/);
assert.match(previewSource, /composerThumbnailLayout = false/);
assert.match(previewSource, /composerThumbnailLayout\?: boolean/);
assert.match(previewSource, /aria-label=\{`放大查看 \$\{file\.fileName\}`\}/);
assert.match(previewSource, /role="dialog"/);
assert.match(previewSource, /aria-modal="true"/);
assert.match(previewSource, /aria-label="放大图片"/);
assert.match(previewSource, /aria-label="缩小图片"/);
assert.match(previewSource, /aria-label="恢复图片原始缩放"/);
assert.match(previewSource, /aria-label="关闭图片预览"/);
assert.match(previewSource, /event\.key === "Escape"/);
assert.ok(
  (previewSource.match(/event\.target === event\.currentTarget/g) ?? []).length >= 2,
  "全屏预览的外层边缘和图片画布空白区都应支持点击关闭。"
);
assert.match(previewSource, /image\?\.naturalWidth/);
assert.match(previewSource, /const containScale = Math\.min/);
assert.match(previewSource, /const clickedVisibleImage =/);
assert.match(previewSource, /if \(clickedVisibleImage\)/);
assert.match(previewSource, /event\.stopPropagation\(\)/);
assert.match(previewSource, /document\.body\.style\.overflow = "hidden"/);
assert.match(previewSource, /previousBodyOverflow/);
assert.match(previewSource, /MIN_PREVIEW_SCALE = 0\.5/);
assert.match(previewSource, /MAX_PREVIEW_SCALE = 3/);
assert.match(previewSource, /onDoubleClick=/);
assert.match(previewSource, /toolbarRef/);
assert.match(previewSource, /event\.key === "Tab"/);
assert.match(previewSource, /Math\.max\(1, previewScale\)/);
assert.match(previewSource, /previewScrollRef/);
assert.match(previewSource, /scrollContainer\.scrollLeft/);
assert.match(previewSource, /previousScrollTop \* scaleRatio/);
assert.match(
  sentMessageSource,
  /<IngestAttachmentPreview files=\{message\.attachments\} imageOnly enableImagePreview \/>/
);
assert.match(
  shellSource,
  /files=\{uploadedFiles\}[\s\S]*?onRemove=\{onRemoveUpload\}[\s\S]*?imageOnly[\s\S]*?enableImagePreview[\s\S]*?composerThumbnailLayout/
);
assert.equal(shellSource.match(/enableImagePreview/g)?.length, 1);
assert.match(previewSource, /"h-16 w-14 rounded-xl"/);
assert.match(previewSource, /"right-0\.5 top-0\.5 h-5 w-5 bg-\[#202020\] text-white hover:bg-black"/);
assert.doesNotMatch(exeInputSource, /enableImagePreview/);
assert.doesNotMatch(exeInputSource, /composerThumbnailLayout/);

console.log("Admin ingest image preview tests passed.");
