import { auditLogPreview } from "@/lib/enterprise/mock-data";
import type { AuditLog } from "@/types/super-admin";

function normalizeLog(item: (typeof auditLogPreview)[number]): AuditLog {
  return {
    ...item,
    user: item.actor,
    action: item.title,
    ip: item.id === "audit-001" ? "10.12.8.24" : "system"
  };
}

export function getRecentLogs(): AuditLog[] {
  return auditLogPreview.map(normalizeLog);
}

export function logLogin(user: string): AuditLog {
  return {
    id: "audit-login-preview",
    category: "登录",
    title: "超级管理员登录事件",
    actor: user,
    user,
    action: "SUPER_ADMIN_LOGIN",
    time: "2026-06-17 09:20",
    ip: "mock-ip",
    status: "normal",
    description: "预留登录审计结构，本阶段不写入数据库。"
  };
}

export function logAction(user: string, action: string): AuditLog {
  return {
    id: "audit-action-preview",
    category: "操作",
    title: action,
    actor: user,
    user,
    action,
    time: "2026-06-17 09:21",
    ip: "mock-ip",
    status: "normal",
    description: "预留操作审计结构，本阶段不写入数据库。"
  };
}

export function logSystemEvent(action: string): AuditLog {
  return {
    id: "audit-system-preview",
    category: "系统",
    title: action,
    actor: "system",
    user: "system",
    action,
    time: "2026-06-17 09:22",
    ip: "system",
    status: "normal",
    description: "预留系统审计结构，本阶段不写入数据库。"
  };
}
