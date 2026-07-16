export type ConversationFeatureFlags = {
  rename: boolean;
  archive: boolean;
  delete: boolean;
  share: boolean;
  groupChat: boolean;
  pinCloudSync: boolean;
};

export type ConversationFeatureFlagKey =
  | "conversation.rename.enabled"
  | "conversation.archive.enabled"
  | "conversation.delete.enabled"
  | "conversation.share.enabled"
  | "conversation.group_chat.enabled"
  | "conversation.pin.cloud_sync_enabled";

export type ConversationFeatureFlagItem = {
  key: ConversationFeatureFlagKey;
  name: keyof ConversationFeatureFlags;
  label: string;
  enabled: boolean;
  description: string;
  riskLevel: "low" | "medium" | "high";
};

export type ConversationFeatureFlagResponse = ConversationFeatureFlags & {
  features: Record<ConversationFeatureFlagKey, boolean>;
  items: ConversationFeatureFlagItem[];
  reasons?: Partial<Record<keyof ConversationFeatureFlags, string>>;
};

export type ConversationControlAuditAction =
  | "rename_conversation"
  | "archive_conversation"
  | "delete_conversation"
  | "pin_conversation"
  | "unpin_conversation"
  | "share_conversation"
  | "create_group_chat"
  | "conversation.share.created"
  | "conversation.group_chat.created"
  | "conversation.group_chat.link_reset"
  | "conversation.group_chat.link_deleted"
  | "conversation.action.denied"
  | "update_feature_flag";
