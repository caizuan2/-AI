import { ShieldCheck } from "lucide-react";
import { AuditLogPreview } from "@/components/super-admin/AuditLogPreview";
import { ModulePlaceholder } from "@/components/super-admin/common/ModulePlaceholder";

export default function SuperAdminAuditPage() {
  return (
    <div className="space-y-6">
      <ModulePlaceholder
        eyebrow="Security Audit"
        title="安全审计日志"
        description="集中查看超级管理员、用户会话、卡密授权和系统策略操作审计。当前保留 mock 预览，并为真实审计查询 API 留出位置。"
        icon={ShieldCheck}
        status="审计入口"
        capabilities={[
          "登录、权限、卡密和会话操作审计入口",
          "危险操作 before / after / ip / userAgent 记录",
          "跨用户端、投喂端、超级管理员端的安全追踪",
          "后续接入分页检索和导出"
        ]}
        boundaries={[
          "不读取或修改用户私人会话正文。",
          "不修改现有同步、上传和历史功能。",
          "不删除任何审计或业务数据。"
        ]}
        nextHref="/super-admin/licenses"
        nextLabel="查看卡密审计"
      />
      <div className="mx-auto max-w-[1600px]">
        <AuditLogPreview />
      </div>
    </div>
  );
}
