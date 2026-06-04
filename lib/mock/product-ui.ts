import {
  BookOpenText,
  BotMessageSquare,
  CheckCircle2,
  Cloud,
  Code2,
  FileArchive,
  FileText,
  Globe,
  HardDrive,
  MessageSquare,
  NotebookTabs,
  ShieldCheck,
  Users
} from "lucide-react";

export type RetrievalMode = "quick" | "deep" | "knowledge_only";

export const retrievalModes = [
  {
    value: "quick" as const,
    label: "快速回答",
    description: "适合 FAQ 和明确问题"
  },
  {
    value: "deep" as const,
    label: "深度检索",
    description: "检索更多来源并综合判断"
  },
  {
    value: "knowledge_only" as const,
    label: "仅知识库",
    description: "没有依据时明确说明不知道"
  }
];

export const dashboardMetrics = [
  { label: "总文档数", value: "1,284", change: "+42", icon: FileText },
  { label: "今日提问数", value: "386", change: "+18%", icon: BotMessageSquare },
  { label: "命中率", value: "87%", change: "+4.2%", icon: CheckCircle2 },
  { label: "平均置信度", value: "82%", change: "-1.1%", icon: ShieldCheck }
];

export const unansweredQuestions = [
  "客户退订后是否保留历史合同记录？",
  "华东区域续费折扣的审批边界是什么？",
  "移动端知识同步失败时如何排查？"
];

export const popularQuestions = [
  { question: "销售安全异议如何回复？", count: 42, confidence: 0.91 },
  { question: "Q2 复盘会议结论是什么？", count: 31, confidence: 0.86 },
  { question: "客服附件解析失败怎么办？", count: 18, confidence: 0.73 }
];

export const knowledgeBaseCards = [
  {
    id: "kb-customer-success",
    title: "客户成功知识库",
    description: "客户会议纪要、续费策略、实施 FAQ 和关键联系人信息。",
    documentCount: 436,
    updatedAt: "2026-06-03 18:20",
    permission: "团队可读",
    indexStatus: "ready" as const
  },
  {
    id: "kb-sales",
    title: "销售赋能资料库",
    description: "销售话术、竞品比较、方案模板和安全合规答疑。",
    documentCount: 289,
    updatedAt: "2026-06-03 15:42",
    permission: "销售组",
    indexStatus: "indexing" as const
  },
  {
    id: "kb-product",
    title: "产品与研发知识库",
    description: "版本计划、产品规格、接口说明和故障复盘记录。",
    documentCount: 327,
    updatedAt: "2026-06-02 21:10",
    permission: "研发组",
    indexStatus: "ready" as const
  }
];

export const documentRows = [
  {
    id: "doc-001",
    title: "华东客户 Q2 复盘会议.md",
    type: "Markdown",
    size: "42KB",
    knowledgeBase: "客户成功知识库",
    status: "ready" as const,
    updatedAt: "2026-06-03 19:12",
    icon: FileText
  },
  {
    id: "doc-002",
    title: "销售安全异议话术.pdf",
    type: "PDF",
    size: "1.8MB",
    knowledgeBase: "销售赋能资料库",
    status: "indexing" as const,
    updatedAt: "2026-06-03 16:03",
    icon: FileArchive
  },
  {
    id: "doc-003",
    title: "客服附件解析失败工单.docx",
    type: "DOCX",
    size: "860KB",
    knowledgeBase: "客服支持知识库",
    status: "failed" as const,
    updatedAt: "2026-06-02 11:34",
    icon: BookOpenText
  },
  {
    id: "doc-004",
    title: "RAG 检索上线检查清单.txt",
    type: "Text",
    size: "18KB",
    knowledgeBase: "产品与研发知识库",
    status: "ready" as const,
    updatedAt: "2026-06-01 22:48",
    icon: FileText
  }
];

export const dataSources = [
  { id: "notion", name: "Notion", description: "同步团队 wiki 和项目文档", status: "connected" as const, lastSync: "2026-06-04 09:20", icon: NotebookTabs },
  { id: "google-drive", name: "Google Drive", description: "同步共享盘文档和表格", status: "available" as const, lastSync: "-", icon: Cloud },
  { id: "slack", name: "Slack", description: "沉淀频道讨论和支持答疑", status: "syncing" as const, lastSync: "2026-06-04 08:46", icon: MessageSquare },
  { id: "github", name: "GitHub", description: "同步 issue、PR 和技术文档", status: "connected" as const, lastSync: "2026-06-03 23:10", icon: Code2 },
  { id: "confluence", name: "Confluence", description: "企业文档空间和知识页面", status: "available" as const, lastSync: "-", icon: Users },
  { id: "website", name: "Website Crawler", description: "抓取官网、帮助中心和文档站", status: "connected" as const, lastSync: "2026-06-04 07:55", icon: Globe },
  { id: "local", name: "Local Files", description: "本地 TXT、MD、PDF、DOCX 投喂", status: "connected" as const, lastSync: "实时", icon: HardDrive }
];

export const suggestedQuestions = [
  "根据最近的客户会议，哪些续费风险最高？",
  "销售遇到安全审计问题时应该怎么回复？",
  "客服附件解析失败的排查步骤是什么？"
];
