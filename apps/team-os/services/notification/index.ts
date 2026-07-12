import "server-only";

import type {
  CreateNotificationInput,
  SendNotificationInput
} from "@/apps/team-os/features/notification/types";
import { notificationGateway } from "@/apps/team-os/features/notification/services/notification-gateway";
import { markNotificationsAsReadForViewer } from "@/apps/team-os/features/notification/services/notification-service";

export function createNotification(input: CreateNotificationInput) {
  return notificationGateway.createNotification(input);
}

export function sendNotification(input: SendNotificationInput) {
  return notificationGateway.sendNotification(input);
}

export function markAsRead(input: {
  companyId: string;
  userId: string;
  notificationIds?: string[];
  all?: boolean;
}) {
  return markNotificationsAsReadForViewer(input);
}

export { NotificationGateway, notificationGateway } from "@/apps/team-os/features/notification/services/notification-gateway";
export {
  getIntegrationsForViewer,
  getNotificationPreferencesForViewer,
  listNotificationsForViewer,
  saveIntegrationForViewer,
  saveNotificationPreferencesForViewer,
  testIntegrationForViewer
} from "@/apps/team-os/features/notification/services/notification-service";
export {
  notifyAiCoachReportGeneratedBestEffort,
  notifyCrmRiskDetectedBestEffort,
  notifyTaskCompletedBestEffort,
  notifyTrainingCompletedBestEffort
} from "@/apps/team-os/features/notification/services/event-notifications";
