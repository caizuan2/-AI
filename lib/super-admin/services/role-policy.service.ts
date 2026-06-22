import "server-only";

import type { SuperAdminRolePolicy } from "@/types/super-admin-users";

export const syncedRolePlatforms = ["web", "android_apk", "windows_exe"] as const;

export const assignableUserRoles = ["user", "ingest_admin", "enterprise_admin", "super_admin"] as const;

export function getRolePolicyMatrix(): SuperAdminRolePolicy[] {
  return [
    {
      role: "user",
      label: "普通用户",
      level: 1,
      description: "只能使用用户端提问、查看自己的会话和上传内容。",
      permissions: ["用户端问答", "本人会话", "本人上传内容", "卡密激活后访问"],
      platformScope: ["Web 用户端", "Android APK 用户端", "Windows EXE 用户端"],
      worktreeBoundary: "Worktree 1 读取统一后端角色，不在本地保存最终权限。",
      riskLevel: "low"
    },
    {
      role: "ingest_admin",
      label: "投喂管理员",
      level: 2,
      description: "负责知识库投喂、资料管理和 AI 对话投喂。",
      permissions: ["知识库投喂", "资料来源管理", "投喂任务查看", "知识整理"],
      platformScope: ["Web 投喂端", "Android APK 投喂端", "Windows EXE 投喂端"],
      worktreeBoundary: "Worktree 2 使用该角色进入投喂能力，但不管理用户私人历史会话。",
      riskLevel: "medium"
    },
    {
      role: "enterprise_admin",
      label: "企业管理员",
      level: 3,
      description: "管理本企业用户、部门、套餐和部分知识库权限。",
      permissions: ["企业用户治理", "部门与套餐预留", "企业知识库权限", "企业级审计查看"],
      platformScope: ["企业 Web 控制台", "企业 APK 控制台", "企业 EXE 控制台"],
      worktreeBoundary: "企业管理员只在本企业租户范围内生效，不能越权进入全局超级后台。",
      riskLevel: "medium"
    },
    {
      role: "super_admin",
      label: "超级管理员",
      level: 4,
      description: "最高权限，管理用户、企业、角色、卡密、系统开关、审计日志、下载更新和三端同步。",
      permissions: ["超级管理员后台", "角色授权", "系统开关", "审计日志", "下载更新", "三端同步治理"],
      platformScope: ["Super Admin Web", "Super Admin Android APK", "Super Admin Windows EXE"],
      worktreeBoundary: "Worktree 3 唯一负责全局权限、开关、授权和审计策略。",
      riskLevel: "high"
    }
  ];
}

export function isAssignableUserRole(role: unknown): role is (typeof assignableUserRoles)[number] {
  return typeof role === "string" && assignableUserRoles.includes(role as (typeof assignableUserRoles)[number]);
}

export function getRoleLabel(role: string) {
  return getRolePolicyMatrix().find((item) => item.role === role)?.label ?? (role === "kb_admin" ? "投喂管理员（旧角色）" : role);
}
