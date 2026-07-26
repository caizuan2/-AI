import assert from "node:assert/strict";
import { searchIngestAgentSidebar } from "../lib/enterprise/admin-ingest-agent-sidebar-search";
import type { IngestAgentConversation } from "../lib/enterprise/mock-agent-conversations";
import type { IngestChatAgent } from "../lib/enterprise/mock-chat";

const agents: IngestChatAgent[] = [
  {
    id: "agent-kks",
    name: "瘦身KKS专业师",
    role: "瘦身指导",
    description: "沉淀瘦身方案与注意事项",
    avatar: "🎧",
    tone: "rose",
    category: "健康"
  },
  {
    id: "agent-career",
    name: "讲事业导师",
    role: "事业辅导",
    description: "整理事业说明与客户沟通",
    avatar: "📦",
    tone: "amber",
    category: "事业"
  }
];

function createConversation(
  id: string,
  agentId: string,
  title: string
): IngestAgentConversation {
  return {
    id,
    agentId,
    title,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    updatedLabel: "刚刚",
    messageCount: 1,
    status: "active",
    source: "admin_ingest",
    platform: "web",
    syncTarget: ["web"]
  };
}

const conversations = [
  createConversation("conversation-kks", "agent-kks", "瘦身注意事项"),
  createConversation("conversation-parent", "agent-career", "宝妈沟通"),
  createConversation("conversation-video", "agent-career", "视频发了，接下来怎么跟进")
];

const allResults = searchIngestAgentSidebar(agents, conversations, "");

assert.equal(allResults.length, 2);
assert.deepEqual(
  allResults.map((result) => result.conversations.length),
  [1, 2]
);
assert.equal(allResults.every((result) => !result.hasConversationMatches), true);

const agentResults = searchIngestAgentSidebar(agents, conversations, "KKS");

assert.deepEqual(agentResults.map((result) => result.agent.id), ["agent-kks"]);
assert.deepEqual(
  agentResults[0]?.conversations.map((conversation) => conversation.id),
  ["conversation-kks"]
);
assert.equal(agentResults[0]?.hasConversationMatches, false);

const conversationResults = searchIngestAgentSidebar(agents, conversations, "宝妈");

assert.deepEqual(conversationResults.map((result) => result.agent.id), ["agent-career"]);
assert.deepEqual(
  conversationResults[0]?.conversations.map((conversation) => conversation.id),
  ["conversation-parent"]
);
assert.equal(conversationResults[0]?.hasConversationMatches, true);

assert.deepEqual(searchIngestAgentSidebar(agents, conversations, "不存在的内容"), []);

console.log("admin-ingest agent sidebar search tests passed");
