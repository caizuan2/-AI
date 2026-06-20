import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { enforceSuperAdminPageAccess } from "@/lib/auth/super-admin-check";

export const metadata: Metadata = {
  title: "超级管理员后台 | AI 知识库",
  description: "AI 知识库企业级超级管理员后台 UI 骨架"
};

export const dynamic = "force-dynamic";

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  await enforceSuperAdminPageAccess();

  return <SuperAdminShell>{children}</SuperAdminShell>;
}
