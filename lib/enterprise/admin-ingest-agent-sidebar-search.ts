import type { IngestAgentConversation } from "./mock-agent-conversations";
import type { IngestChatAgent } from "./mock-chat";

export interface IngestAgentSidebarSearchResult {
  agent: IngestChatAgent;
  conversations: IngestAgentConversation[];
  hasConversationMatches: boolean;
}

export function searchIngestAgentSidebar(
  agents: IngestChatAgent[],
  conversations: IngestAgentConversation[],
  keyword: string
): IngestAgentSidebarSearchResult[] {
  const normalizedKeyword = keyword.trim().toLowerCase();

  return agents.reduce<IngestAgentSidebarSearchResult[]>((results, agent) => {
    const agentConversations = conversations.filter((conversation) => conversation.agentId === agent.id);

    if (!normalizedKeyword) {
      results.push({
        agent,
        conversations: agentConversations,
        hasConversationMatches: false
      });
      return results;
    }

    const agentMatches = [
      agent.name,
      agent.role,
      agent.description,
      agent.category
    ].join(" ").toLowerCase().includes(normalizedKeyword);
    const matchingConversations = agentConversations.filter((conversation) => (
      conversation.status !== "archived"
      && conversation.title.toLowerCase().includes(normalizedKeyword)
    ));

    if (!agentMatches && matchingConversations.length === 0) {
      return results;
    }

    results.push({
      agent,
      conversations: matchingConversations.length > 0 ? matchingConversations : agentConversations,
      hasConversationMatches: matchingConversations.length > 0
    });
    return results;
  }, []);
}
