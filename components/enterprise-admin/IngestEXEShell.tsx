import { IngestEXEAgentList } from "@/components/enterprise-admin/IngestEXEAgentList";
import { IngestEXESidebar } from "@/components/enterprise-admin/IngestEXESidebar";
import { IngestEXEWorkspace } from "@/components/enterprise-admin/IngestEXEWorkspace";
import type {
  IngestConnectionStatus,
  IngestVoiceState,
  IngestUploadState
} from "@/lib/enterprise/ingest-client";
import type {
  IngestChatAgent,
  IngestKnowledgeDraft,
  IngestTrainingRecord
} from "@/lib/enterprise/mock-chat";
import type { AdminIngestDisplayProfile } from "@/lib/enterprise/admin-ingest-profile";
import type { IngestAgentConversation } from "@/lib/enterprise/mock-agent-conversations";
import type { IngestExpert } from "@/lib/enterprise/mock-experts";
import {
  ingestEXEAgents,
  ingestEXECollections,
  ingestEXEGeneratedBlocks,
  ingestEXENavItems,
  ingestEXEReviewItems,
  ingestEXETasks,
  ingestEXETools
} from "@/lib/enterprise/mock-ingest";

type IngestActionResult = {
  draft: IngestKnowledgeDraft;
  records: IngestTrainingRecord[];
  preview: boolean;
  message: string;
};
type IngestRailKey = "chat" | "experts" | "tasks" | "files" | "connections" | "memory" | "lab" | "notifications" | "settings";

interface IngestEXEShellProps {
  agents: IngestChatAgent[];
  activeAgent: IngestChatAgent;
  hasActiveAgent: boolean;
  activeAgentId: string;
  adminAvatar?: string;
  appName?: string;
  displayProfile?: AdminIngestDisplayProfile;
  onAgentChange: (agentId: string) => void;
  agentConversations: IngestAgentConversation[];
  activeConversationId: string;
  expandedAgentIds: string[];
  expandedConversationAgentIds: string[];
  pinnedAgentIds: string[];
  onAgentToggleExpanded: (agentId: string) => void;
  onAgentConversationToggleExpanded: (agentId: string) => void;
  onAgentConversationSelect: (agentId: string, conversationId: string) => void;
  onAgentConversationCreate: (agentId: string) => void;
  onAgentConversationRename: (agentId: string, conversationId: string, title: string) => void;
  onAgentConversationDelete: (agentId: string, conversationId: string) => void;
  onAgentTogglePinned: (agentId: string) => void;
  activeRailKey: IngestRailKey;
  onRailChange: (key: IngestRailKey) => void;
  searchKeyword: string;
  onSearchKeywordChange: (value: string) => void;
  selectedModel: string;
  modelOptions: string[];
  onModelChange: (model: string) => void;
  connectionStatus: IngestConnectionStatus;
  onCheckConnection: () => Promise<IngestConnectionStatus>;
  input: string;
  onInputChange: (value: string) => void;
  draft: IngestKnowledgeDraft;
  records: IngestTrainingRecord[];
  noticeMessage: string;
  errorMessage: string;
  uploadState: IngestUploadState | null;
  uploadedFiles: IngestUploadState[];
  voiceState: IngestVoiceState;
  isParsing: boolean;
  onOpenCreateAgent: () => void;
  onAddExpertToAgent: (expert: IngestExpert) => void;
  addedExpertIds: string[];
  onAgentViewDetails: (agentId: string) => void;
  onAgentDelete: (agentId: string) => void;
  onSend: (value?: string) => Promise<IngestActionResult | null>;
  onUpload: (files: File[]) => void;
  onRemoveUpload: (fileId: string) => void;
  onVoiceToggle: () => void;
  onToolAction: (label: string) => void;
}

export function IngestEXEShell({
  agents,
  activeAgent,
  hasActiveAgent,
  activeAgentId,
  adminAvatar = "",
  appName,
  displayProfile,
  onAgentChange,
  agentConversations,
  activeConversationId,
  expandedAgentIds,
  expandedConversationAgentIds,
  pinnedAgentIds,
  onAgentToggleExpanded,
  onAgentConversationToggleExpanded,
  onAgentConversationSelect,
  onAgentConversationCreate,
  onAgentConversationRename,
  onAgentConversationDelete,
  onAgentTogglePinned,
  activeRailKey,
  onRailChange,
  searchKeyword,
  onSearchKeywordChange,
  selectedModel,
  modelOptions,
  onModelChange,
  connectionStatus,
  onCheckConnection,
  input,
  onInputChange,
  draft,
  records,
  noticeMessage,
  errorMessage,
  uploadState,
  uploadedFiles,
  voiceState,
  isParsing,
  onOpenCreateAgent,
  onAddExpertToAgent,
  addedExpertIds,
  onAgentViewDetails,
  onAgentDelete,
  onSend,
  onUpload,
  onRemoveUpload,
  onVoiceToggle,
  onToolAction
}: IngestEXEShellProps) {
  const exeAgents = agents.map((agent) => {
    const existing = ingestEXEAgents.find((item) => item.id === agent.id);

    return {
      id: agent.id,
      name: existing?.name ?? agent.name,
      role: existing?.role ?? agent.role,
      description: agent.description,
      avatar: agent.avatar,
      active: agent.id === activeAgentId,
      stats: existing?.stats ?? "新建 · 待训练",
      tone: existing?.tone ?? agent.tone,
      status: agent.status,
      isSystem: agent.isSystem,
      source: agent.source,
      managedBySuperAdmin: agent.managedBySuperAdmin,
      editableByIngestAdmin: agent.editableByIngestAdmin,
      deletableByIngestAdmin: agent.deletableByIngestAdmin,
      visibleToUserClient: agent.visibleToUserClient
    };
  });

  return (
    <main className="h-screen overflow-hidden bg-[#f7f7f6] text-[#191919]">
      <div className="mx-auto flex h-screen max-w-[1600px] overflow-hidden border-x border-[#e8e8e6] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <IngestEXESidebar items={ingestEXENavItems} activeRailKey={activeRailKey} adminAvatar={adminAvatar} onRailChange={onRailChange} />
        <IngestEXEAgentList
          agents={exeAgents}
          collections={ingestEXECollections}
          tasks={ingestEXETasks}
          activeAgentId={activeAgentId}
          adminAvatar={adminAvatar}
          appName={appName}
          onAgentChange={onAgentChange}
          agentConversations={agentConversations}
          activeConversationId={activeConversationId}
          expandedAgentIds={expandedAgentIds}
          expandedConversationAgentIds={expandedConversationAgentIds}
          pinnedAgentIds={pinnedAgentIds}
          onAgentToggleExpanded={onAgentToggleExpanded}
          onAgentConversationToggleExpanded={onAgentConversationToggleExpanded}
          onAgentConversationSelect={onAgentConversationSelect}
          onAgentConversationCreate={onAgentConversationCreate}
          onAgentConversationRename={onAgentConversationRename}
          onAgentConversationDelete={onAgentConversationDelete}
          onAgentTogglePinned={onAgentTogglePinned}
          searchKeyword={searchKeyword}
          onSearchKeywordChange={onSearchKeywordChange}
          records={records}
          onOpenCreateAgent={onOpenCreateAgent}
          onAgentViewDetails={onAgentViewDetails}
          onAgentDelete={onAgentDelete}
          onRailChange={onRailChange}
        />
        <IngestEXEWorkspace
          activeAgent={activeAgent}
          hasActiveAgent={hasActiveAgent}
          adminAvatar={adminAvatar}
          appName={appName}
          displayProfile={displayProfile}
          activeRailKey={activeRailKey}
          blocks={ingestEXEGeneratedBlocks}
          reviewItems={ingestEXEReviewItems}
          tools={ingestEXETools}
          input={input}
          onInputChange={onInputChange}
          draft={draft}
          records={records}
          noticeMessage={noticeMessage}
          errorMessage={errorMessage}
          uploadState={uploadState}
          uploadedFiles={uploadedFiles}
          voiceState={voiceState}
          selectedModel={selectedModel}
          modelOptions={modelOptions}
          onModelChange={onModelChange}
          connectionStatus={connectionStatus}
          onCheckConnection={onCheckConnection}
          isParsing={isParsing}
          onSend={onSend}
          onUpload={onUpload}
          onRemoveUpload={onRemoveUpload}
          onVoiceToggle={onVoiceToggle}
          onToolAction={onToolAction}
          onOpenExperts={() => onRailChange("experts")}
          onAddExpertToAgent={onAddExpertToAgent}
          addedExpertIds={addedExpertIds}
        />
      </div>
    </main>
  );
}
