export type ChatMode = "fast" | "expert";
export type RagConfidence = "high" | "medium" | "low";
export type ProviderStatus = "ok" | "provider_not_configured" | "no_relevant_knowledge" | "error";
export type AttachmentType = "image" | "camera_photo" | "gallery_photo" | "file" | "audio" | "video";

export interface ChatAttachmentDraft {
  type: AttachmentType;
  name?: string;
  mime_type?: string;
  size?: number;
  reference_id?: string;
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
  provider_status?: ProviderStatus | null;
  created_at: string;
  pending?: boolean;
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

export interface AskChatRequest {
  text: string;
  attachments: ChatAttachmentDraft[];
  conversation_id: string | null;
  mode: ChatMode;
  enable_deep_thinking: boolean;
  enable_web_search: boolean;
}

export interface AskChatResponse {
  answer: string;
  conversation_id: string;
  message_id: string;
  mode: ChatMode;
  customer_answer?: string | null;
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
