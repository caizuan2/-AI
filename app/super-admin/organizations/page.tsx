import { Building2 } from "lucide-react";
import { ModulePlaceholder } from "@/components/super-admin/common/ModulePlaceholder";

export default function SuperAdminOrganizationsPage() {
  return (
    <ModulePlaceholder
      eyebrow="Enterprise Organization"
      title="企业组织 / 部门 / 角色管理"
      description="统一承载企业、部门、租户和企业管理员授权的超级管理员入口。本阶段先拆出独立模块，后续接入真实组织与多租户数据。"
      icon={Building2}
      status="模块已独立"
      capabilities={[
        "企业与租户档案查看入口",
        "部门、角色、授权策略管理预留",
        "enterprise_admin 与 super_admin 边界说明",
        "后续 Prisma 多租户 tenant_id 接入点"
      ]}
      boundaries={[
        "不修改用户端 APK / EXE 与 Flutter。",
        "不接管管理员投喂版知识库运营功能。",
        "本阶段不修改 Prisma schema 或数据库结构。"
      ]}
      nextHref="/super-admin/roles"
      nextLabel="查看角色权限"
    />
  );
}
