import { Bot } from "lucide-react";
import { ModulePlaceholder } from "@/components/super-admin/common/ModulePlaceholder";

export default function SuperAdminModelConfigPage() {
  return (
    <ModulePlaceholder
      eyebrow="AI Model Policy"
      title="AI 模型配置中心"
      description="用于承载模型供应商、额度、成本、降级策略和安全策略。当前保持 mock 和策略说明，不改 AI 问答核心链路。"
      icon={Bot}
      status="策略入口"
      capabilities={[
        "模型供应商、额度和成本视图预留",
        "AI Gateway 策略和降级规则入口",
        "高风险请求拦截策略说明",
        "后续接入租户级模型配置"
      ]}
      boundaries={[
        "不修改用户端 AI 问答 UI。",
        "不修改 OpenAI / 模型调用核心配置。",
        "不影响已有 AI 回答 Markdown 和复制功能。"
      ]}
      nextHref="/super-admin/usage"
      nextLabel="查看使用量统计"
    />
  );
}
