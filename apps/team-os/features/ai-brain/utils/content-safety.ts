import { createHash } from "crypto";

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const MAINLAND_PHONE = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const LANDLINE_PHONE = /(?<!\d)(?:0\d{2,3}[- ]?)?\d{7,8}(?!\d)/g;
const WECHAT_ID = /(?:微信(?:号|ID)?|wechat|wx)\s*[:：号]?\s*[a-z][-_a-z0-9]{5,19}/gi;
const IDENTITY_CARD = /(?<!\d)\d{17}[\dXx](?!\d)/g;
const LABELED_NAME = /(?:客户姓名|联系人|姓名)\s*[:：]\s*[\u3400-\u9fff·]{2,20}/g;
const LABELED_INTERNAL_ID = /\b(?:customer|user|task|recipient|owner|workflow|event)[-_ ]?id\s*[:=：]\s*[a-z0-9_-]{6,}\b/gi;
const URL = /https?:\/\/[^\s)\]}]+/gi;

export function normalizeBrainText(value: string, maxLength: number) {
  const normalized = value
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

export function redactBusinessContent(value: string, maxLength = 12_000) {
  const redacted = normalizeBrainText(value, maxLength)
    .replace(EMAIL, "[邮箱已脱敏]")
    .replace(MAINLAND_PHONE, "[手机号已脱敏]")
    .replace(LANDLINE_PHONE, "[电话已脱敏]")
    .replace(WECHAT_ID, "[微信号已脱敏]")
    .replace(IDENTITY_CARD, "[证件号已脱敏]")
    .replace(LABELED_NAME, "[姓名已脱敏]")
    .replace(LABELED_INTERNAL_ID, "[内部标识已脱敏]")
    .replace(URL, "[链接已脱敏]");
  return normalizeBrainText(redacted, maxLength);
}

export function normalizeQuestionKey(value: string) {
  return normalizeBrainText(value, 2_000)
    .toLocaleLowerCase()
    .replace(/[\s!-/:-@[-`{-~\u2000-\u206f\u3000-\u303f\uff01-\uff65]+/g, "");
}

export function stableBrainKey(...parts: string[]) {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex");
}
