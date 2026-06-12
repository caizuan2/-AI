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

export interface CurrentChatUser {
  id: string;
  phone?: string | null;
  email?: string | null;
  account?: string | null;
  name?: string | null;
  nickname?: string | null;
  avatar?: string | null;
  avatar_url?: string | null;
  licenseActivated: boolean;
}

export interface AvatarUpdateResponse {
  avatar_url: string;
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

export interface CurrentUserResponse {
  user: CurrentChatUser;
}
