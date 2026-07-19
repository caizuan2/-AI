export const NOTIFICATION_TYPES = ["TASK", "AI_COACH", "CRM", "TRAINING", "SYSTEM"] as const;
export const NOTIFICATION_READ_STATUSES = ["UNREAD", "READ"] as const;
export const NOTIFICATION_CHANNELS = ["IN_APP", "EMAIL", "WECHAT", "DINGTALK", "FEISHU"] as const;
export const INTEGRATION_PROVIDERS = ["WECHAT_WORK", "DINGTALK", "FEISHU"] as const;
export const NOTIFICATION_SCOPES = ["MINE", "TEAM"] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationReadStatus = (typeof NOTIFICATION_READ_STATUSES)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];
export type NotificationScope = (typeof NOTIFICATION_SCOPES)[number];

export interface NotificationRecord {
  id: string;
  companyId: string;
  teamId: string | null;
  userId: string;
  recipientName?: string | null;
  type: NotificationType;
  title: string;
  content: string;
  readStatus: NotificationReadStatus;
  source: string;
  createdAt: string;
}

export interface CreateNotificationInput {
  companyId: string;
  teamId?: string;
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  source: string;
}

export interface NotificationListQuery {
  companyId: string;
  teamIds?: string[];
  userIds: string[];
  type?: NotificationType;
  readStatus?: NotificationReadStatus;
  page: number;
  pageSize: number;
}

export interface NotificationPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface NotificationCompanyOption {
  id: string;
  name: string;
}

export interface NotificationListData {
  companyId: string;
  companies: NotificationCompanyOption[];
  scope: NotificationScope;
  canViewTeamNotifications: boolean;
  items: NotificationRecord[];
  unreadCount: number;
  pagination: NotificationPagination;
}

export interface MarkNotificationsReadInput {
  companyId: string;
  userId: string;
  notificationIds?: string[];
  all?: boolean;
}

export interface MarkNotificationsReadResult {
  updatedCount: number;
  unreadCount: number;
}

export interface NotificationPreferenceRecord {
  id: string | null;
  userId: string;
  channel: NotificationChannel;
  enabled: boolean;
  createdAt: string | null;
}

export interface NotificationPreferenceData {
  companyId: string;
  companies: NotificationCompanyOption[];
  preferences: NotificationPreferenceRecord[];
}

export interface UpdateNotificationPreferenceInput {
  userId: string;
  channel: NotificationChannel;
  enabled: boolean;
}

export interface StoredIntegrationConfig {
  id: string;
  companyId: string;
  provider: IntegrationProvider;
  enabled: boolean;
  encryptedConfig: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationConfigSummary {
  id: string;
  companyId: string;
  provider: IntegrationProvider;
  enabled: boolean;
  configured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationListData {
  companyId: string;
  companies: NotificationCompanyOption[];
  integrations: IntegrationConfigSummary[];
  canManage: boolean;
}

export interface SaveIntegrationConfigInput {
  companyId: string;
  provider: IntegrationProvider;
  enabled: boolean;
  encryptedConfig?: string;
}

export interface SaveIntegrationConfigRequest {
  companyId: string;
  provider: IntegrationProvider;
  enabled: boolean;
  config?: Record<string, string>;
}

export interface ProviderMessage {
  companyId: string;
  userId: string;
  title: string;
  content: string;
  source: string;
}

export interface ProviderSendContext {
  mode: "TEST" | "PRODUCTION";
  config?: Readonly<Record<string, unknown>>;
}

export interface ProviderSendResult {
  provider: IntegrationProvider;
  mode: "TEST" | "PRODUCTION";
  accepted: boolean;
  delivered: false;
  reason: string;
}

export interface NotificationProvider {
  readonly provider: IntegrationProvider;
  sendMessage(message: ProviderMessage, context: ProviderSendContext): Promise<ProviderSendResult>;
}

export interface NotificationRepository {
  create(input: CreateNotificationInput): Promise<NotificationRecord>;
  list(query: NotificationListQuery): Promise<{ items: NotificationRecord[]; total: number }>;
  countUnread(input: { companyId: string; teamIds?: string[]; userIds: string[] }): Promise<number>;
  markAsRead(input: MarkNotificationsReadInput): Promise<number>;
}

export interface NotificationPreferenceRepository {
  list(userId: string): Promise<NotificationPreferenceRecord[]>;
  upsertMany(inputs: UpdateNotificationPreferenceInput[]): Promise<NotificationPreferenceRecord[]>;
}

export interface IntegrationConfigRepository {
  listByCompany(companyId: string): Promise<IntegrationConfigSummary[]>;
  findStored(companyId: string, provider: IntegrationProvider): Promise<StoredIntegrationConfig | null>;
  save(input: SaveIntegrationConfigInput): Promise<IntegrationConfigSummary>;
}

export interface SendNotificationInput extends CreateNotificationInput {
  channels?: NotificationChannel[];
  mode?: "TEST" | "PRODUCTION";
}

export interface NotificationDeliveryAttempt {
  channel: NotificationChannel;
  status: "CREATED" | "SKIPPED" | "FAILED";
  notificationId?: string;
  reason?: string;
}

export interface SendNotificationResult {
  attempts: NotificationDeliveryAttempt[];
}

export interface NotificationRepositories {
  notifications: NotificationRepository;
  preferences: NotificationPreferenceRepository;
  integrations: IntegrationConfigRepository;
}

export interface ProviderTestResult {
  provider: IntegrationProvider;
  mode: "TEST";
  delivered: false;
  reason: string;
}
