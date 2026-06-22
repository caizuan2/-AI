import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { getRolePolicyMatrix } from "@/lib/super-admin/services/role-policy.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);

    return superAdminSuccess({
      roles: getRolePolicyMatrix(),
      syncedPlatforms: ["web", "android_apk", "windows_exe"],
      boundary: {
        worktree1: "用户端读取统一后端角色，不在 Flutter / APK / EXE 本地保存最终权限。",
        worktree2: "投喂版只使用投喂管理员权限，不管理用户私人历史会话。",
        worktree3: "超级管理员后台负责全局角色授权、审计和三端权限治理。"
      }
    });
  } catch (error) {
    return superAdminError(error);
  }
}
