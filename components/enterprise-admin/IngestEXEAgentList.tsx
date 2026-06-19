import { ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import { IngestAgentConversationList } from "@/components/enterprise-admin/IngestAgentConversationList";
import { IngestAgentMoreMenu } from "@/components/enterprise-admin/IngestAgentMoreMenu";
import { IngestAgentAvatar } from "@/components/enterprise-admin/IngestAgentAvatar";
import { IngestResizableSidebar } from "@/components/enterprise-admin/IngestResizableSidebar";
import { resolveAdminIngestDisplayProfile } from "@/lib/enterprise/admin-ingest-profile";
import type { IngestAgentConversation } from "@/lib/enterprise/mock-agent-conversations";
import type { IngestEXEAgent, IngestEXECollection, IngestEXETask } from "@/lib/enterprise/mock-ingest";
import type { IngestTrainingRecord } from "@/lib/enterprise/mock-chat";

type IngestRailKey = "chat" | "experts" | "tasks" | "files" | "connections" | "memory" | "lab" | "notifications" | "settings";

export function IngestEXEAgentList({
  agents,
  activeAgentId,
  adminAvatar,
  appName,
  onAgentChange,
  agentConversations = [],
  activeConversationId = "",
  expandedAgentIds = [],
  expandedConversationAgentIds = [],
  pinnedAgentIds = [],
  onAgentToggleExpanded,
  onAgentConversationToggleExpanded,
  onAgentConversationSelect,
  onAgentConversationCreate,
  onAgentConversationRename,
  onAgentConversationDelete,
  onAgentTogglePinned,
  searchKeyword = "",
  onSearchKeywordChange,
  onOpenCreateAgent,
  onAgentViewDetails,
  onAgentDelete,
  onRailChange
}: {
  agents: IngestEXEAgent[];
  collections: IngestEXECollection[];
  tasks: IngestEXETask[];
  activeAgentId?: string;
  adminAvatar?: string;
  appName?: string;
  onAgentChange?: (agentId: string) => void;
  agentConversations?: IngestAgentConversation[];
  activeConversationId?: string;
  expandedAgentIds?: string[];
  expandedConversationAgentIds?: string[];
  pinnedAgentIds?: string[];
  onAgentToggleExpanded?: (agentId: string) => void;
  onAgentConversationToggleExpanded?: (agentId: string) => void;
  onAgentConversationSelect?: (agentId: string, conversationId: string) => void;
  onAgentConversationCreate?: (agentId: string) => void;
  onAgentConversationRename?: (agentId: string, conversationId: string, title: string) => void;
  onAgentConversationDelete?: (agentId: string, conversationId: string) => void;
  onAgentTogglePinned?: (agentId: string) => void;
  searchKeyword?: string;
  onSearchKeywordChange?: (value: string) => void;
  records?: IngestTrainingRecord[];
  onOpenCreateAgent?: () => void;
  onAgentViewDetails?: (agentId: string) => void;
  onAgentDelete?: (agentId: string) => void;
  onRailChange?: (key: IngestRailKey) => void;
}) {
  const normalizedSearch = searchKeyword.trim().toLowerCase();
  const filteredAgents = normalizedSearch
    ? agents.filter((agent) => [agent.name, agent.role, agent.description].join(" ").toLowerCase().includes(normalizedSearch))
    : agents;
  const hasSearchResults = filteredAgents.length > 0;

  return (
    <IngestResizableSidebar className="border-[#ececea] bg-[#fafafa]" ariaLabel="管理员投喂工作室 Agent 列表">
      <div className="p-4 pb-3">
        <div className="flex h-10 items-center gap-2 rounded-2xl bg-[#f0f0ef] px-3 text-sm text-[#8a8a86]">
          <Search className="h-4 w-4" aria-hidden="true" />
          <input
            value={searchKeyword}
            onChange={(event) => onSearchKeywordChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onRailChange?.("experts");
              }
            }}
            placeholder="搜索 Agent / 专家"
            className="min-w-0 flex-1 bg-transparent text-sm text-[#333] outline-none placeholder:text-[#8a8a86]"
          />
        </div>
        <button type="button" onClick={onOpenCreateAgent} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-[#e4e4e1] bg-white text-sm font-medium text-[#202020] shadow-sm transition hover:bg-[#f7f7f5]">
          <Plus className="h-4 w-4" aria-hidden="true" />
          添加专家 Agent
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#999]">Knowledge Agent</div>
        <div className="space-y-1.5">
          {agents.length === 0 ? (
            <div className="mx-2 rounded-2xl border border-dashed border-[#d9d9d5] bg-white px-3 py-5 text-center">
              <p className="text-xs font-semibold text-[#202020]">暂无 Agent，请到专家广场添加专家。</p>
              <button
                type="button"
                onClick={() => onRailChange?.("experts")}
                className="mt-3 h-8 rounded-full bg-[#202020] px-3 text-xs font-semibold text-white hover:bg-black"
              >
                打开专家广场
              </button>
            </div>
          ) : !hasSearchResults ? (
            <div className="mx-2 rounded-2xl bg-[#f6f6f5] px-3 py-4 text-center text-xs leading-5 text-[#8a8a86]">
              没有找到相关 Agent 或知识库
            </div>
          ) : null}
          {filteredAgents.map((agent) => {
            const isActive = (activeAgentId ?? agents.find((item) => item.active)?.id) === agent.id;
            const isExpanded = expandedAgentIds.includes(agent.id);
            const isPinned = pinnedAgentIds.includes(agent.id);
            const conversations = agentConversations.filter((conversation) => conversation.agentId === agent.id);
            const agentProfile = resolveAdminIngestDisplayProfile({
              currentAgent: agent,
              appName,
              adminAvatar
            });

            return (
              <div key={agent.id} className="mx-2">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onAgentChange?.(agent.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onAgentChange?.(agent.id);
                    }
                  }}
                  className={[
                    "group relative w-full rounded-2xl border px-2.5 py-2 text-left transition",
                    isActive
                      ? "border-orange-200 bg-gradient-to-r from-orange-50 via-amber-50 to-white shadow-sm"
                      : "border-transparent bg-transparent hover:bg-[#f5f3ef]"
                  ].join(" ")}
                >
                  {isActive ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-orange-400 to-amber-400" /> : null}
                  <div className="flex min-h-[56px] items-center gap-3">
                    <IngestAgentAvatar profile={agentProfile} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={["block min-w-0 flex-1 truncate text-sm font-semibold", isActive ? "text-[#2f1f0f]" : "text-[#1f1f1f]"].join(" ")}>{agent.name}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {isPinned ? <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#9a6500]">置顶</span> : null}
                          <span className="flex items-center gap-1 transition">
                            <IngestAgentMoreMenu
                              agent={agent}
                              isPinned={isPinned}
                              onCreateConversation={(agentId) => onAgentConversationCreate?.(agentId)}
                              onTogglePinned={(agentId) => onAgentTogglePinned?.(agentId)}
                              onViewDetails={(agentId) => {
                                if (onAgentViewDetails) {
                                  onAgentViewDetails(agentId);
                                  return;
                                }

                                onAgentChange?.(agentId);
                              }}
                              onDelete={(agentId) => onAgentDelete?.(agentId)}
                            />
                            <button
                              type="button"
                              aria-label={isExpanded ? "收起 Agent 对话记录" : "展开 Agent 对话记录"}
                              onClick={(event) => {
                                event.stopPropagation();
                                onAgentToggleExpanded?.(agent.id);
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-[#8a8a86] transition hover:bg-white hover:text-[#202020]"
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                            </button>
                          </span>
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#9a9a96]">{agent.description || agent.role}</span>
                    </span>
                  </div>
                </div>
                {isExpanded ? (
                  <IngestAgentConversationList
                    agentId={agent.id}
                    conversations={conversations}
                    activeConversationId={activeConversationId}
                    expandedAll={expandedConversationAgentIds.includes(agent.id)}
                    onSelectConversation={(agentId, conversationId) => onAgentConversationSelect?.(agentId, conversationId)}
                    onToggleExpandedAll={(agentId) => onAgentConversationToggleExpanded?.(agentId)}
                    onRenameConversation={(agentId, conversationId, title) => onAgentConversationRename?.(agentId, conversationId, title)}
                    onDeleteConversation={(agentId, conversationId) => onAgentConversationDelete?.(agentId, conversationId)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </IngestResizableSidebar>
  );
}
