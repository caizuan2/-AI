export type GptOSBusinessContentType = "SOP" | "article" | "script" | "knowledge" | "report" | "course";

export interface GptOSBusinessTemplate {
  type: GptOSBusinessContentType;
  label: string;
  sections: string[];
  optimizationFocus: string[];
  exportOptions: string[];
}

const BUSINESS_TEMPLATES: Record<GptOSBusinessContentType, GptOSBusinessTemplate> = {
  SOP: {
    type: "SOP",
    label: "商业 SOP 模板",
    sections: ["目标场景", "适用对象", "执行步骤", "判断条件", "质检标准", "复盘指标"],
    optimizationFocus: ["标准化", "可复制", "低风险执行"],
    exportOptions: ["SOP 文档", "培训清单", "流程卡片"]
  },
  article: {
    type: "article",
    label: "SEO 文章模板",
    sections: ["标题关键词", "痛点开场", "核心观点", "案例说明", "行动建议", "FAQ"],
    optimizationFocus: ["搜索意图", "可读性", "长尾关键词"],
    exportOptions: ["公众号文章", "SEO 页面", "知识库长文"]
  },
  script: {
    type: "script",
    label: "销售话术模板",
    sections: ["客户画像", "开场破冰", "痛点确认", "价值表达", "异议处理", "成交推进"],
    optimizationFocus: ["转化率", "客户信任", "可复制话术"],
    exportOptions: ["客服话术", "销售脚本", "招商跟进话术"]
  },
  knowledge: {
    type: "knowledge",
    label: "知识库结构模板",
    sections: ["知识标题", "分类标签", "适用场景", "标准问答", "安全边界", "更新周期"],
    optimizationFocus: ["可检索", "可训练", "可复用"],
    exportOptions: ["知识库草稿", "FAQ", "训练记录"]
  },
  report: {
    type: "report",
    label: "商业报告模板",
    sections: ["背景", "现状诊断", "机会判断", "解决方案", "风险控制", "下一步计划"],
    optimizationFocus: ["决策清晰度", "证据链", "商业价值"],
    exportOptions: ["商业报告", "PPT 大纲", "管理层简报"]
  },
  course: {
    type: "course",
    label: "培训课程模板",
    sections: ["学习目标", "核心概念", "案例讲解", "练习任务", "考核问题", "课后 SOP"],
    optimizationFocus: ["学习路径", "知识迁移", "内部培训"],
    exportOptions: ["培训课件", "讲师手册", "学习清单"]
  }
};

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function inferBusinessContentType(text: string): GptOSBusinessContentType {
  if (hasAny(text, [/SOP|流程|标准化|执行清单|操作规范/i])) return "SOP";
  if (hasAny(text, [/文章|SEO|公众号|小红书|标题|关键词|传播/i])) return "article";
  if (hasAny(text, [/话术|销售|成交|转化|招商|异议|客户沟通/i])) return "script";
  if (hasAny(text, [/报告|分析报告|商业分析|管理层|复盘|诊断/i])) return "report";
  if (hasAny(text, [/培训|课程|讲师|学习|教学/i])) return "course";
  if (hasAny(text, [/知识库|FAQ|标准问答|入库|投喂|训练/i])) return "knowledge";

  return "knowledge";
}

export function getGptOSBusinessTemplate(type: GptOSBusinessContentType) {
  return BUSINESS_TEMPLATES[type];
}

export function listGptOSBusinessTemplates() {
  return Object.values(BUSINESS_TEMPLATES);
}
