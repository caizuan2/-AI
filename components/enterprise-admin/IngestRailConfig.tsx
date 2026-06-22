import type { ComponentType } from "react";
import {
  BotMessageSquare,
  Brain,
  Check,
  CircleUserRound,
  FlaskConical,
  FolderOpen,
  Plug,
  Settings
} from "lucide-react";

export type IngestRailKey = "chat" | "experts" | "tasks" | "files" | "connections" | "memory" | "lab" | "notifications" | "settings";
export type IngestRailManagedBy = "system" | "super_admin_future";

export interface IngestRailFeature {
  key: IngestRailKey;
  label: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  enabled: boolean;
  managedBy: IngestRailManagedBy;
  disabledHint?: string;
}

const futureHint = "该功能将由超级管理员后台开启。";

export const ingestRailFeatures: IngestRailFeature[] = [
  { key: "chat", label: "对话", title: "AI 对话投喂", icon: BotMessageSquare, enabled: true, managedBy: "system" },
  { key: "experts", label: "专家", title: "专家广场：添加专家到 Agent", icon: CircleUserRound, enabled: true, managedBy: "super_admin_future" },
  { key: "tasks", label: "任务", title: "训练任务", icon: Check, enabled: true, managedBy: "super_admin_future" },
  { key: "files", label: "文件", title: "文档投喂", icon: FolderOpen, enabled: false, managedBy: "super_admin_future", disabledHint: futureHint },
  { key: "connections", label: "连接", title: "网址 / 系统连接", icon: Plug, enabled: false, managedBy: "super_admin_future", disabledHint: futureHint },
  { key: "memory", label: "记忆", title: "知识记忆", icon: Brain, enabled: false, managedBy: "super_admin_future", disabledHint: futureHint },
  { key: "lab", label: "Lab", title: "实验功能", icon: FlaskConical, enabled: false, managedBy: "super_admin_future", disabledHint: futureHint },
  { key: "settings", label: "设置", title: "投喂端设置", icon: Settings, enabled: true, managedBy: "system" }
];

export const ingestPrimaryRailFeatures = ingestRailFeatures.filter((feature) => feature.key !== "settings");

export function getIngestRailFeature(key: IngestRailKey) {
  return ingestRailFeatures.find((feature) => feature.key === key);
}
