import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  capabilitiesForIngestTier,
  resolveIngestAccessTierFromFacts
} from "../lib/enterprise/ingest-access-policy";
import { isAuthFailure } from "../lib/enterprise/ingest-response-normalizer";

const activeFacts = {
  isActive: true,
  isSuperAdmin: false,
  hasPrivilegedIngestRole: false,
  hasActiveIngestLicense: false,
  hasActiveUserLicense: false,
  hasLegacyUserLicense: false
};

test("ingest access tier keeps user cards chat-only and ingest cards full", () => {
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    hasActiveUserLicense: true
  }), "chat_only");
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    hasPrivilegedIngestRole: true,
    hasActiveIngestLicense: true
  }), "full_ingest");
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    isSuperAdmin: true
  }), "full_ingest");
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    isActive: false,
    isSuperAdmin: true,
    hasActiveUserLicense: true,
    hasPrivilegedIngestRole: true,
    hasActiveIngestLicense: true
  }), "none");
});

test("dual-card accounts prefer active ingest and safely downgrade to active user access", () => {
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    hasPrivilegedIngestRole: true,
    hasActiveIngestLicense: true,
    hasActiveUserLicense: true
  }), "full_ingest");
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    hasPrivilegedIngestRole: true,
    hasActiveIngestLicense: false,
    hasActiveUserLicense: true
  }), "chat_only");
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    hasPrivilegedIngestRole: true,
    hasActiveIngestLicense: true,
    hasActiveUserLicense: false
  }), "full_ingest");
  assert.equal(resolveIngestAccessTierFromFacts({
    ...activeFacts,
    hasPrivilegedIngestRole: true
  }), "none");
});

test("capabilities expose only chat for user cards", () => {
  assert.deepEqual(capabilitiesForIngestTier("chat_only"), {
    enterPortal: true,
    chat: true,
    aiControl: false,
    trainingMemory: false,
    saveKnowledge: false
  });
  assert.deepEqual(capabilitiesForIngestTier("full_ingest"), {
    enterPortal: true,
    chat: true,
    aiControl: true,
    trainingMemory: true,
    saveKnowledge: true
  });
  assert.equal(isAuthFailure(200, {
    success: true,
    data: {
      authenticated: true,
      hasIngestPortalAccess: true,
      hasIngestAccess: false,
      accessTier: "chat_only"
    }
  }), false, "chat-only must not be mistaken for a logged-out session");
});

test("registration and activation accept only user or ingest cards", () => {
  const registerRoute = readFileSync("app/api/ingest/auth/register/route.ts", "utf8");
  const activateRoute = readFileSync("app/api/ingest/auth/activate-license/route.ts", "utf8");
  const resetRoute = readFileSync("app/api/ingest/auth/reset-password/route.ts", "utf8");
  const authPortal = readFileSync("components/enterprise-admin/IngestSaasAuthPortal.tsx", "utf8");

  assert.match(registerRoute, /appType !== "user_app" && appType !== "ingest_admin"/);
  assert.match(activateRoute, /appType !== "user_app" && appType !== "ingest_admin"/);
  assert.match(resetRoute, /appType === "user_app" \|\| appType === "ingest_admin"/);
  assert.match(registerRoute, /appType,\s+ip:/);
  assert.match(activateRoute, /appType: input\.appType/);
  assert.match(resetRoute, /hasRedeemedLicenseForAppType\(user\.id, appType\)/);
  assert.doesNotMatch(registerRoute, /appType: "ingest_admin"/);
  assert.doesNotMatch(activateRoute, /appType: "ingest_admin"/);
  assert.match(authPortal, /typeof source\.hasIngestAccess === "boolean"/);
  assert.match(
    authPortal,
    /if \(authState\.hasIngestAccess \|\| authState\.accessTier === "full_ingest"\)/,
    "chat-only users must remain on activation so an ingest card can upgrade the account"
  );
});

test("chat-only UI hides advanced navigation and knowledge save without removing chat tools", () => {
  const page = readFileSync("app/admin-ingest/page.tsx", "utf8");
  const modeToggle = readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8");
  const shell = readFileSync("components/enterprise-admin/IngestChatGPTShell.tsx", "utf8");
  const actions = readFileSync("components/enterprise-admin/IngestKnowledgeDraftActions.tsx", "utf8");

  assert.match(page, /accessTier=\{access\.accessTier\}/);
  assert.match(page, /capabilities=\{access\.capabilities\}/);
  assert.match(modeToggle, /accessTier === "full_ingest" && activeRailKey !== "experts"/);
  assert.match(modeToggle, /const effectiveMode = capabilities\.aiControl \|\| capabilities\.trainingMemory \? mode : "chat"/);
  assert.match(modeToggle, /const effectiveRailKey = !capabilities\.trainingMemory/);
  assert.match(modeToggle, /activeRailKey: effectiveRailKey/);
  assert.match(modeToggle, /: "回答已生成。"/);
  assert.match(shell, /item\.key !== "tasks" && item\.key !== "memory"/);
  assert.match(shell, /if \(!canSaveKnowledge\)/);
  assert.match(
    shell,
    /placeholder=\{canIngest[\s\S]*?\? \(canUseFullIngestTools \? "投喂 小董AI" : "问问 小董AI"\)[\s\S]*?: "请先添加AI专家。"\}/,
    "输入框必须根据投喂端卡密与用户端卡密显示对应的小董AI文案"
  );
  assert.match(
    shell,
    /isParsing \? "h-10 w-auto px-3 text-xs font-semibold" : "h-9 w-9"/,
    "空闲发送按钮应缩小为 36px，生成中的停止按钮保持原尺寸"
  );
  assert.match(shell, /<SendHorizontal className="h-3\.5 w-3\.5"/);
  assert.match(
    shell,
    /if \(!input\.trim\(\) && uploadedFiles\.length === 0\) \{[\s\S]*?textarea\.style\.height = "44px";[\s\S]*?textarea\.style\.overflowY = "hidden";[\s\S]*?textarea\.scrollTop = 0;/,
    "空输入必须立即恢复 44px 单行高度，不能保留上一条多行提示词的高度"
  );
  assert.match(
    shell,
    /\}, \[activeConversationId, input, uploadedFiles\.length\]\);/,
    "切换对话时也必须重新校正输入框高度"
  );
  assert.match(
    shell,
    /rounded-\[24px\] border border-\[#c9f0eb\] bg-\[#e9fbf9\] px-4 py-3 text-\[#174c47\] shadow-sm/,
    "管理员投喂版自己发送的文字气泡必须使用 Logo 同色系浅绿色"
  );
  assert.match(actions, /\{canSaveKnowledge \? \(/);
  assert.match(actions, /title="复制"/);
  assert.match(actions, /title=\{isParsing \? "生成中" : "重新生成"\}/);
  assert.match(modeToggle, /canUseFullIngestTools: accessTier === "full_ingest"/);
  assert.match(
    shell,
    /canUseFullIngestTools \|\| !action\.requiresFullIngestAccess/,
    "user cards must see camera and image while file and URL remain hidden"
  );
});

test("server gates prevent chat-only writes and internal prompt preview exposure", () => {
  const gptRoute = readFileSync("app/api/admin/kb/ingest/gpt/route.ts", "utf8");
  const parseRoute = readFileSync("app/api/admin/kb/ingest/files/parse/route.ts", "utf8");
  const urlRoute = readFileSync("app/api/admin/kb/ingest/url/route.ts", "utf8");
  const saveRoute = readFileSync("app/api/admin/kb/save/route.ts", "utf8");
  const authGuard = readFileSync("lib/enterprise/admin-ingest-auth.ts", "utf8");
  const promptPreview = readFileSync("app/api/admin/ingest-memory/prompt-preview/route.ts", "utf8");
  const savePost = saveRoute.slice(saveRoute.indexOf("export async function POST"));

  assert.match(gptRoute, /hasFullIngestAccess && enterpriseActor && hasDatabaseUrl\(\) && structuredForTrainingLog/);
  assert.match(gptRoute, /input\.operation === "retry_doubao_metadata"[\s\S]*requireFullAdminIngestAccess/);
  assert.match(gptRoute, /!hasFullIngestAccess[\s\S]*input\.attachments\.some/);
  assert.match(parseRoute, /accessTier !== "full_ingest"[\s\S]*isAdminIngestImageAttachment/);
  assert.match(urlRoute, /await requireFullAdminIngestAccess\(\)/);
  assert.ok(
    savePost.indexOf("await requireFullAdminIngestAccess()")
      < savePost.indexOf("await saveDraftOnlyKnowledge"),
    "full access must be checked before any KnowledgeItem save path"
  );
  assert.match(authGuard, /throw new IngestFullAccessRequiredError\(\)/);
  assert.match(promptPreview, /requireAdminIngestActor\(request\)/);
  assert.doesNotMatch(promptPreview, /requireAdminIngestChatActor/);
  assert.match(gptRoute, /buildAdminIngestPublishedMemoryContext/);
  assert.match(
    readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8"),
    /!capabilities\.trainingMemory[\s\S]*CHAT_ONLY_SERVER_GROUNDING/,
    "chat-only must rely on server-side GPT grounding without fetching prompt preview"
  );
});

test("license monitor refreshes server-rendered capabilities without downgrading on network errors", () => {
  const gate = readFileSync("components/enterprise-admin/IngestLicenseInvalidGate.tsx", "utf8");
  const layout = readFileSync("app/admin-ingest/layout.tsx", "utf8");

  assert.match(gate, /const payload = await response\.json\(\)/);
  assert.match(gate, /const nextTier = readAccessTier\(payload\)/);
  assert.match(gate, /readAdminIngestHistoryScopeFromApiResponse\(payload\)/);
  assert.match(
    gate,
    /hasAdminIngestHistoryScopeChanged\([\s\S]*historyScopeRef\.current,[\s\S]*nextHistoryScope[\s\S]*window\.location\.reload\(\)/
  );
  assert.match(gate, /nextTier !== accessTierRef\.current/);
  assert.match(gate, /router\.refresh\(\)/);
  assert.doesNotMatch(gate, /accessTierRef\.current = nextTier/);
  assert.match(gate, /Network failures and aborted checks must not invalidate/);
  assert.match(layout, /initialHistoryScope = access\.capabilities\.enterPortal[\s\S]*createAdminIngestHistoryScope\(user\.id\)/);
  assert.match(layout, /initialHistoryScope=\{initialHistoryScope\}/);
});
