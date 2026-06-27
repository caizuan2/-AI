import type { ChatModeCandidate, ChatModeKey, ChatModeSource } from "./lib/intent-mode-router";

export type ChatMode = "fast" | "expert";
export type RagConfidence = "high" | "medium" | "low";
export type ProviderStatus = "ok" | "provider_not_configured" | "no_relevant_knowledge" | "error";
export type AttachmentType = "image" | "camera_photo" | "gallery_photo" | "file" | "audio" | "video";
export type ChatAttachmentSource = "gallery" | "camera" | "file";

export interface ChatAttachmentDraft {
  id?: string;
  type: AttachmentType;
  source?: ChatAttachmentSource;
  name?: string;
  filename?: string;
  mime_type?: string;
  mimeType?: string;
  size?: number;
  reference_id?: string;
  previewUrl?: string;
  url?: string;
  src?: string;
  dataUrl?: string;
  fileUrl?: string;
  publicUrl?: string;
  downloadUrl?: string;
  path?: string;
  storagePath?: string;
  storage?: string;
  blobKey?: string;
  file?: File;
  metadata?: Record<string, unknown>;
}

export interface ChatSource {
  chunk_id: string;
  file_id: string | null;
  title: string;
  score: number;
}

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: ChatAttachmentDraft[] | null;
  sources?: ChatSource[] | null;
  confidence?: RagConfidence | null;
  customer_answer?: string | null;
  finalized_answer?: FinalizedAnswerView | null;
  provider_status?: ProviderStatus | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  pending?: boolean;
}

export interface FinalizedAnswerView {
  title: string;
  problemUnderstanding: string;
  keyConclusion: string;
  suggestedSteps: string[];
  customerReply: string;
  nextAction: string;
  evidenceSummary?: string;
  confidenceLabel?: "高" | "中" | "低";
  debug?: {
    removedInternalLabels: string[];
    originalLength: number;
    finalLength: number;
  };
}

export interface ChatConversation {
  id: string;
  title: string;
  mode: ChatMode;
  metadata: Record<string, unknown> | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatQuickActionItem {
  id: string;
  label: string;
  prompt?: string | null;
  kind?: "mode" | "category" | "tool";
  mode?: ChatMode;
  sortOrder?: number | null;
  description?: string | null;
  icon?: string | null;
  type?: string | null;
  action?: string | null;
}

export interface SelectedKnowledgeBase {
  kb_id: string;
  kbId?: string;
  knowledgeBaseId?: string;
  expert_id?: string;
  expertId?: string;
  agentId?: string;
  tenant_id?: string;
  tenantId?: string;
  namespace?: string;
  title: string;
  name?: string;
  expertName?: string;
  category?: string;
  description?: string;
  active: boolean;
}

export interface ExpertMarketItem {
  kb_id: string;
  kbId?: string;
  knowledgeBaseId?: string;
  expert_id?: string;
  expertId?: string;
  agentId?: string;
  tenant_id?: string;
  tenantId?: string;
  namespace?: string;
  title: string;
  name?: string;
  expertName?: string;
  category?: string;
  description?: string;
}

export interface ExpertMarketSection {
  key: string;
  title: string;
  items: ExpertMarketItem[];
}

export interface ExpertMarketResponse {
  ok: boolean;
  message?: string;
  baseUrl?: string | null;
  endpoint?: string | null;
  sections: ExpertMarketSection[];
}

export interface CurrentChatUser {
  id: string;
  phone?: string | null;
  email?: string | null;
  account?: string | null;
  displayName?: string | null;
  username?: string | null;
  name?: string | null;
  nickname?: string | null;
  avatar?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  image?: string | null;
  profileImage?: string | null;
  profile_image?: string | null;
  avatarUpdatedAt?: string | null;
  avatar_updated_at?: string | null;
  licenseActivated: boolean;
}

export interface AvatarUpdateResponse {
  avatar_url: string | null;
  avatarUrl?: string | null;
  updated_at?: string | null;
  avatar_updated_at?: string | null;
  avatarUpdatedAt?: string | null;
}

export interface ChatAttachmentUploadResponse {
  attachment: ChatAttachmentDraft;
}

export interface ChangePasswordResponse {
  changed: true;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface AskChatRequest {
  text: string;
  attachments: ChatAttachmentDraft[];
  conversation_id: string | null;
  mode: ChatMode;
  userMode?: ChatModeKey;
  modeSource?: ChatModeSource;
  modeLabel?: string;
  modePrompt?: string;
  modeConfidence?: number;
  modeReason?: string;
  modeAlternatives?: ChatModeCandidate[];
  classifierVersion?: string;
  enable_deep_thinking: boolean;
  enable_web_search: boolean;
  business_execution?: unknown;
  business_execution_prompt?: string | null;
  auto_sales_agent?: unknown;
  conversion_feedback?: unknown;
  selectedKnowledgeBases?: SelectedKnowledgeBase[];
  activeKnowledgeBase?: SelectedKnowledgeBase | null;
  kb_id?: string | null;
  knowledgeBaseId?: string | null;
  expert_id?: string | null;
  agentId?: string | null;
  tenant_id?: string | null;
  namespace?: string | null;
}

export interface AskChatResponse {
  answer: string;
  conversation_id: string;
  message_id: string;
  mode: ChatMode;
  customer_answer?: string | null;
  finalized_answer?: FinalizedAnswerView | null;
  sources: ChatSource[];
  confidence: RagConfidence;
  provider_status?: ProviderStatus;
}

export interface ConversationsResponse {
  conversations: ChatConversation[];
}

export interface HistoryResponse {
  conversation: ChatConversation;
  messages: ChatMessageView[];
}

export interface CurrentUserResponse {
  user: CurrentChatUser;
}
