export type IngestEXENavId = "feed" | "knowledge" | "files" | "tasks" | "review" | "fix" | "settings";

export type IngestEXETone = "green" | "blue" | "amber" | "rose" | "slate";

export interface IngestEXENavItem {
  id: IngestEXENavId;
  label: string;
  title: string;
  active?: boolean;
  count?: number;
}

export interface IngestEXEAgent {
  id: string;
  name: string;
  role: string;
  description: string;
  avatar: string;
  active?: boolean;
  stats: string;
  tone: IngestEXETone;
}

export interface IngestEXECollection {
  id: string;
  name: string;
  kind: "知识库" | "分类" | "训练";
  count: number;
  status: string;
}

export interface IngestEXETask {
  id: string;
  title: string;
  source: string;
  status: string;
  progress: number;
}

export interface IngestEXEGeneratedBlock {
  id: string;
  title: string;
  content: string;
  status: string;
  tone: IngestEXETone;
}

export interface IngestEXEReviewItem {
  id: string;
  title: string;
  meta: string;
  priority: string;
}

export interface IngestEXETool {
  id: string;
  label: string;
  shortcut: string;
  active?: boolean;
}

export const ingestEXENavItems: IngestEXENavItem[] = [
  { id: "feed", label: "投喂", title: "AI 对话投喂", active: true },
  { id: "knowledge", label: "知识", title: "知识库列表" },
  { id: "files", label: "文件", title: "文档 / 图片 / 网址投喂", count: 4 },
  { id: "tasks", label: "任务", title: "训练记录", count: 12 },
  { id: "review", label: "审核", title: "审核任务", count: 5 },
  { id: "fix", label: "修正", title: "AI 修正", count: 3 },
  { id: "settings", label: "设置", title: "我的设置" }
];

export const ingestEXEAgents: IngestEXEAgent[] = [
  {
    id: "chief",
    name: "知识生产主管",
    role: "默认工作站",
    description: "负责把原始内容拆成标准知识点、问答和来源引用。",
    avatar: "知",
    active: true,
    stats: "今日 24 条",
    tone: "green"
  },
  {
    id: "product",
    name: "产品知识库",
    role: "产品 Agent",
    description: "沉淀功能说明、版本差异、FAQ 和使用边界。",
    avatar: "产",
    stats: "86 条知识",
    tone: "blue"
  },
  {
    id: "service",
    name: "客服话术库",
    role: "话术 Agent",
    description: "整理客户沟通话术、异议处理和可复制回复。",
    avatar: "客",
    stats: "213 条知识",
    tone: "amber"
  },
  {
    id: "after-sale",
    name: "售后知识库",
    role: "售后 Agent",
    description: "管理退款、换货、保修和工单处理流程。",
    avatar: "售",
    stats: "74 条知识",
    tone: "rose"
  },
  {
    id: "policy",
    name: "企业制度库",
    role: "制度 Agent",
    description: "维护内部制度、审批规范和执行口径。",
    avatar: "制",
    stats: "51 条知识",
    tone: "slate"
  },
  {
    id: "sales",
    name: "销售知识库",
    role: "销售 Agent",
    description: "沉淀销售话术、案例材料和报价说明。",
    avatar: "销",
    stats: "97 条知识",
    tone: "green"
  }
];

export const ingestEXECollections: IngestEXECollection[] = [
  { id: "default", name: "默认知识库", kind: "知识库", count: 128, status: "同步完成" },
  { id: "tag-service", name: "客服 / 售后", kind: "分类", count: 54, status: "待复核 6" },
  { id: "tag-product", name: "产品功能", kind: "分类", count: 39, status: "稳定" },
  { id: "training-queue", name: "训练任务队列", kind: "训练", count: 12, status: "运行中" }
];

export const ingestEXETasks: IngestEXETask[] = [
  { id: "task-1", title: "售后退款说明.pdf", source: "PDF 投喂", status: "解析中", progress: 68 },
  { id: "task-2", title: "客服对话整理", source: "AI 对话投喂", status: "待保存", progress: 84 },
  { id: "task-3", title: "产品截图 OCR", source: "图片投喂", status: "待审核", progress: 42 }
];

export const ingestEXEGeneratedBlocks: IngestEXEGeneratedBlock[] = [
  {
    id: "qa",
    title: "问答生成区",
    content: "已根据输入生成 3 组标准问答，适合客服和售后直接引用。",
    status: "已生成",
    tone: "green"
  },
  {
    id: "extract",
    title: "知识提取区",
    content: "标题、摘要、分类、标签、重要程度已完成预整理。",
    status: "待确认",
    tone: "blue"
  },
  {
    id: "parser",
    title: "文件解析区",
    content: "PDF / Word / PPT / 图片 OCR 入口已就绪，本阶段使用 mock 状态。",
    status: "占位",
    tone: "amber"
  },
  {
    id: "save",
    title: "保存到知识库区",
    content: "确认后保存到目标知识库，保留来源、分类和审核状态。",
    status: "人工保存",
    tone: "slate"
  }
];

export const ingestEXEReviewItems: IngestEXEReviewItem[] = [
  { id: "review-1", title: "退款时效描述需要人工确认", meta: "客服话术库 · 来自 PDF", priority: "高" },
  { id: "review-2", title: "新版套餐权益说明缺少边界", meta: "产品知识库 · 来自网址", priority: "中" },
  { id: "review-3", title: "OCR 识别截图含模糊字段", meta: "图片投喂 · 待校对", priority: "中" }
];

export const ingestEXETools: IngestEXETool[] = [
  { id: "chat", label: "AI 对话投喂", shortcut: "Ctrl+1", active: true },
  { id: "pdf", label: "PDF", shortcut: "Ctrl+P" },
  { id: "word", label: "Word", shortcut: "Ctrl+W" },
  { id: "ppt", label: "PPT", shortcut: "Ctrl+Shift+P" },
  { id: "image", label: "图片 OCR", shortcut: "Ctrl+I" },
  { id: "url", label: "网址投喂", shortcut: "Ctrl+L" },
  { id: "tag", label: "分类标签", shortcut: "Ctrl+T" },
  { id: "fix", label: "AI 修正", shortcut: "Ctrl+F" }
];
