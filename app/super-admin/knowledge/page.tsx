import { Database } from "lucide-react";
import { ModulePlaceholder } from "@/components/super-admin/common/ModulePlaceholder";

export default function SuperAdminKnowledgePage() {
  return (
    <ModulePlaceholder
      eyebrow="Knowledge Governance"
      title="知识库管理中心"
      description="面向超级管理员的知识库治理视图，关注全局文档数量、来源一致性、索引健康和跨端数据边界，不替代投喂管理员的内容生产流程。"
      icon={Database}
      status="治理入口"
      capabilities={[
        "全局知识库状态与质量治理入口",
        "文档来源、分类、标签和索引健康预留",
        "会话分享引用知识库来源的审计边界",
        "后续与投喂版来源数据保持一致"
      ]}
      boundaries={[
        "不修改 /ingest 投喂后台核心逻辑。",
        "删除或归档用户会话不删除知识库原始文档。",
        "本页面不处理用户私人历史会话正文。"
      ]}
      nextHref="/super-admin/conversation-controls"
      nextLabel="查看会话控制"
    />
  );
}
