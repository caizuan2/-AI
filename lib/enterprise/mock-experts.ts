import type { IngestChatAgentTone } from "@/lib/enterprise/mock-chat";

export type IngestExpertZoneId = "market" | "news" | "leader";

export interface IngestExpertZone {
  id: IngestExpertZoneId;
  label: string;
  title: string;
  subtitle: string;
  accent: string;
  experts: string[];
}

export interface IngestExpert {
  id: string;
  name: string;
  description: string;
  author: string;
  heat: string;
  usage: string;
  favorites: string;
  category: string;
  subcategory: string;
  zoneId: IngestExpertZoneId;
  zoneTitle: string;
  avatar: string;
  tone: IngestChatAgentTone;
  badge?: string;
  tags: string[];
}

export const ingestExpertZones: IngestExpertZone[] = [
  {
    id: "market",
    label: "市场专区",
    title: "为你推荐",
    subtitle: "Personal Picks",
    accent: "from-[#dff8e8] via-white to-[#eef5ff]",
    experts: ["大健康专家", "讲事业导师", "瘦身KKS专业师"]
  },
  {
    id: "news",
    label: "资讯专区",
    title: "热门精选",
    subtitle: "Popular Now",
    accent: "from-[#fff3d6] via-white to-[#f5f0ff]",
    experts: ["三生中国", "三生素材库", "市场资料素材"]
  },
  {
    id: "leader",
    label: "领袖专区",
    title: "最近上新",
    subtitle: "Fresh Releases",
    accent: "from-[#ffe8ea] via-white to-[#edf7ff]",
    experts: ["种子训练营", "领袖之路", "千军万马"]
  }
];
export const ingestExpertPrimaryCategories = [
  "全部",
  "一人公司",
  "金融投资",
  "内容创作",
  "办公协同",
  "营销增长",
  "技术工程",
  "视觉创意",
  "学习教育",
  "生活娱乐",
  "金融部"
];
export const ingestExpertSecondaryCategories = [
  "全部",
  "AI工具",
  "代码开发",
  "游戏开发",
  "空间计算/XR",
  "运维排障"
];

export const ingestExperts: IngestExpert[] = [
  {
    id: "expert-health",
    name: "大健康专家",
    description: "适合整理健康产品资料、用户问答、活动口径和科普素材。",
    author: "QClaw",
    heat: "9.8",
    usage: "12.4k",
    favorites: "2.1k",
    category: "营销增长",
    subcategory: "AI工具",
    zoneId: "market",
    zoneTitle: "市场专区",
    avatar: "康",
    tone: "green",
    badge: "1",
    tags: ["健康", "资料整理", "客户问答"]
  },
  {
    id: "expert-career",
    name: "讲事业导师",
    description: "把事业说明、会议内容和招商话术整理成可训练知识。",
    author: "QClaw",
    heat: "9.6",
    usage: "10.8k",
    favorites: "1.8k",
    category: "学习教育",
    subcategory: "AI工具",
    zoneId: "market",
    zoneTitle: "市场专区",
    avatar: "事",
    tone: "amber",
    badge: "2",
    tags: ["事业说明", "培训", "标准问答"]
  },
  {
    id: "expert-slim-kks",
    name: "瘦身KKS专业师",
    description: "沉淀瘦身方案、注意事项、客户复盘和周期跟进知识。",
    author: "KKS Lab",
    heat: "9.3",
    usage: "8.7k",
    favorites: "1.2k",
    category: "生活娱乐",
    subcategory: "AI工具",
    zoneId: "market",
    zoneTitle: "市场专区",
    avatar: "瘦",
    tone: "rose",
    badge: "3",
    tags: ["瘦身", "跟进", "方案"]
  },
  {
    id: "expert-sansheng-china",
    name: "三生中国",
    description: "整理企业资讯、品牌事件、新闻通稿和统一对外口径。",
    author: "三生素材库",
    heat: "9.9",
    usage: "15.1k",
    favorites: "2.8k",
    category: "内容创作",
    subcategory: "AI工具",
    zoneId: "news",
    zoneTitle: "资讯专区",
    avatar: "三",
    tone: "blue",
    badge: "1",
    tags: ["企业资讯", "品牌", "通稿"]
  },
  {
    id: "expert-sansheng-assets",
    name: "三生素材库",
    description: "管理市场图文、短视频脚本、宣发素材和活动说明。",
    author: "三生素材库",
    heat: "9.5",
    usage: "11.3k",
    favorites: "1.9k",
    category: "内容创作",
    subcategory: "AI工具",
    zoneId: "news",
    zoneTitle: "资讯专区",
    avatar: "素",
    tone: "green",
    badge: "2",
    tags: ["素材", "脚本", "活动"]
  },
  {
    id: "expert-market-assets",
    name: "市场资料素材",
    description: "将市场资料整理为标题、分类、标签、问答和训练记录。",
    author: "Market Desk",
    heat: "9.1",
    usage: "9.6k",
    favorites: "1.4k",
    category: "营销增长",
    subcategory: "AI工具",
    zoneId: "news",
    zoneTitle: "资讯专区",
    avatar: "资",
    tone: "slate",
    badge: "3",
    tags: ["市场资料", "分类", "入库"]
  },
  {
    id: "expert-seed-camp",
    name: "种子训练营",
    description: "适合训练营 SOP、课程复盘、学员问答和行动清单。",
    author: "Leader Studio",
    heat: "9.7",
    usage: "13.2k",
    favorites: "2.2k",
    category: "学习教育",
    subcategory: "AI工具",
    zoneId: "leader",
    zoneTitle: "领袖专区",
    avatar: "种",
    tone: "green",
    badge: "1",
    tags: ["训练营", "课程", "行动清单"]
  },
  {
    id: "expert-leader-road",
    name: "领袖之路",
    description: "沉淀团队管理、复制流程、成长路径和会议标准话术。",
    author: "Leader Studio",
    heat: "9.4",
    usage: "9.9k",
    favorites: "1.6k",
    category: "办公协同",
    subcategory: "AI工具",
    zoneId: "leader",
    zoneTitle: "领袖专区",
    avatar: "领",
    tone: "blue",
    badge: "2",
    tags: ["团队", "复制", "会议"]
  },
  {
    id: "expert-army",
    name: "千军万马",
    description: "面向团队扩张、市场动作、成交复盘和代理培养知识。",
    author: "Leader Studio",
    heat: "9.2",
    usage: "8.4k",
    favorites: "1.1k",
    category: "营销增长",
    subcategory: "AI工具",
    zoneId: "leader",
    zoneTitle: "领袖专区",
    avatar: "军",
    tone: "amber",
    badge: "3",
    tags: ["团队扩张", "成交", "培养"]
  },
  {
    id: "expert-wechat-miniapp",
    name: "微信小程序开发者",
    description: "从需求、接口、页面到上线审核，整理小程序开发知识。",
    author: "QClaw",
    heat: "8.9",
    usage: "7.2k",
    favorites: "980",
    category: "技术工程",
    subcategory: "代码开发",
    zoneId: "market",
    zoneTitle: "市场专区",
    avatar: "微",
    tone: "green",
    tags: ["小程序", "代码", "上线"]
  },
  {
    id: "expert-prompt",
    name: "提示词工程师",
    description: "整理提示词模板、角色设定、输出规范和评估方法。",
    author: "Prompt Lab",
    heat: "8.8",
    usage: "6.9k",
    favorites: "920",
    category: "AI工具",
    subcategory: "AI工具",
    zoneId: "market",
    zoneTitle: "市场专区",
    avatar: "提",
    tone: "blue",
    tags: ["提示词", "模板", "评估"]
  },
  {
    id: "expert-python",
    name: "Python全栈工程师",
    description: "沉淀 Python 后端、数据处理、脚本自动化和部署经验。",
    author: "Code Hub",
    heat: "8.7",
    usage: "6.5k",
    favorites: "880",
    category: "技术工程",
    subcategory: "代码开发",
    zoneId: "news",
    zoneTitle: "资讯专区",
    avatar: "Py",
    tone: "slate",
    tags: ["Python", "后端", "自动化"]
  },
  {
    id: "expert-security",
    name: "安全工程师",
    description: "整理安全巡检、风险排查、权限控制和应急响应知识。",
    author: "Sec Ops",
    heat: "8.6",
    usage: "5.8k",
    favorites: "760",
    category: "技术工程",
    subcategory: "运维排障",
    zoneId: "leader",
    zoneTitle: "领袖专区",
    avatar: "安",
    tone: "rose",
    tags: ["安全", "权限", "应急"]
  },
  {
    id: "expert-automation",
    name: "重复操作自动化专家",
    description: "把重复流程拆解成脚本、SOP、触发条件和检查项。",
    author: "Ops Studio",
    heat: "8.5",
    usage: "5.4k",
    favorites: "710",
    category: "办公协同",
    subcategory: "运维排障",
    zoneId: "market",
    zoneTitle: "市场专区",
    avatar: "自",
    tone: "amber",
    tags: ["自动化", "SOP", "效率"]
  },
  {
    id: "expert-game",
    name: "游戏设计师",
    description: "沉淀玩法、关卡、数值、活动和玩家反馈整理知识。",
    author: "Game Desk",
    heat: "8.3",
    usage: "4.8k",
    favorites: "620",
    category: "视觉创意",
    subcategory: "游戏开发",
    zoneId: "news",
    zoneTitle: "资讯专区",
    avatar: "游",
    tone: "green",
    tags: ["游戏", "玩法", "数值"]
  },
  {
    id: "expert-ai-engineer",
    name: "AI工程师",
    description: "整理模型调用、RAG、评测、提示词和工程化落地经验。",
    author: "AI Core",
    heat: "8.9",
    usage: "7.7k",
    favorites: "1.1k",
    category: "技术工程",
    subcategory: "AI工具",
    zoneId: "leader",
    zoneTitle: "领袖专区",
    avatar: "AI",
    tone: "blue",
    tags: ["AI", "RAG", "工程化"]
  },
  {
    id: "expert-api-test",
    name: "API测试专家",
    description: "沉淀接口测试、用例设计、异常场景和回归检查清单。",
    author: "QA Room",
    heat: "8.1",
    usage: "4.4k",
    favorites: "520",
    category: "技术工程",
    subcategory: "代码开发",
    zoneId: "market",
    zoneTitle: "市场专区",
    avatar: "测",
    tone: "slate",
    tags: ["API", "测试", "回归"]
  },
  {
    id: "expert-frontend",
    name: "前端开发者",
    description: "整理组件、样式、交互、性能和跨端适配知识。",
    author: "FE Hub",
    heat: "8.4",
    usage: "5.1k",
    favorites: "690",
    category: "技术工程",
    subcategory: "代码开发",
    zoneId: "news",
    zoneTitle: "资讯专区",
    avatar: "前",
    tone: "green",
    tags: ["前端", "组件", "适配"]
  },
  {
    id: "expert-log-analysis",
    name: "日志异常分析专家",
    description: "把日志、报错、指标和排障路径整理成可复用知识。",
    author: "SRE Lab",
    heat: "8.2",
    usage: "4.7k",
    favorites: "580",
    category: "技术工程",
    subcategory: "运维排障",
    zoneId: "leader",
    zoneTitle: "领袖专区",
    avatar: "日",
    tone: "amber",
    tags: ["日志", "排障", "指标"]
  },
  {
    id: "expert-image-prompt",
    name: "图像提示词工程师",
    description: "整理图像生成提示词、风格词、镜头语言和成片标准。",
    author: "Visual Lab",
    heat: "8.0",
    usage: "4.1k",
    favorites: "550",
    category: "视觉创意",
    subcategory: "AI工具",
    zoneId: "market",
    zoneTitle: "市场专区",
    avatar: "图",
    tone: "rose",
    tags: ["图像", "提示词", "风格"]
  },
  {
    id: "expert-backend",
    name: "后端架构师",
    description: "沉淀接口设计、服务拆分、缓存策略和稳定性知识。",
    author: "Backend Guild",
    heat: "8.6",
    usage: "5.9k",
    favorites: "740",
    category: "技术工程",
    subcategory: "代码开发",
    zoneId: "news",
    zoneTitle: "资讯专区",
    avatar: "后",
    tone: "blue",
    tags: ["后端", "架构", "缓存"]
  },
  {
    id: "expert-sre",
    name: "SRE站点可靠性工程师",
    description: "整理监控、告警、SLO、事故复盘和发布保障知识。",
    author: "SRE Lab",
    heat: "8.5",
    usage: "5.2k",
    favorites: "680",
    category: "技术工程",
    subcategory: "运维排障",
    zoneId: "leader",
    zoneTitle: "领袖专区",
    avatar: "SR",
    tone: "green",
    tags: ["SRE", "监控", "复盘"]
  },
  {
    id: "expert-mobile",
    name: "移动端开发专家",
    description: "整理移动端页面、权限、发布、崩溃排查和兼容知识。",
    author: "Mobile Desk",
    heat: "8.1",
    usage: "4.3k",
    favorites: "510",
    category: "技术工程",
    subcategory: "代码开发",
    zoneId: "news",
    zoneTitle: "资讯专区",
    avatar: "移",
    tone: "slate",
    tags: ["移动端", "发布", "兼容"]
  },
  {
    id: "expert-code-writer",
    name: "代码文学家",
    description: "把复杂代码、评审意见和技术决策整理成清晰知识库文本。",
    author: "Docs Lab",
    heat: "7.9",
    usage: "3.8k",
    favorites: "470",
    category: "内容创作",
    subcategory: "代码开发",
    zoneId: "market",
    zoneTitle: "市场专区",
    avatar: "文",
    tone: "amber",
    tags: ["文档", "代码", "解释"]
  }
];
