import type { FeedRecord, KnowledgeItem } from "@/types";

export const knowledgeItems: KnowledgeItem[] = [
  {
    id: "customer-success-playbook",
    title: "企业客户成功交付手册",
    summary:
      "沉淀从首次需求澄清、试点部署到季度复盘的客户成功流程，明确各阶段的负责人、交付物和风险信号。",
    category: "客户成功",
    owner: "客户增长组",
    status: "synced",
    source: "飞书会议纪要 / 客户复盘",
    confidence: 0.92,
    createdAt: "2026-04-18",
    updatedAt: "2026-05-29",
    tags: ["SOP", "交付", "复盘"],
    chunks: [
      {
        id: "cs-1",
        title: "试点启动",
        speaker: "客户成功经理",
        content:
          "试点启动会需要确认三类信息：业务目标、样本数据范围、验收指标。若客户无法给出量化指标，应先完成一页纸目标定义再进入部署。",
        createdAt: "2026-05-12"
      },
      {
        id: "cs-2",
        title: "风险信号",
        speaker: "项目经理",
        content:
          "连续两周没有业务方参与评审，或关键联系人只反馈技术问题，通常意味着价值共识不足，需要升级到业务负责人沟通。",
        createdAt: "2026-05-16"
      }
    ],
    relatedQuestions: [
      "客户试点启动前需要确认哪些内容？",
      "交付过程中如何判断项目存在价值风险？",
      "季度复盘应该输出哪些材料？"
    ]
  },
  {
    id: "product-release-notes",
    title: "知识库 2.4 版本发布说明",
    summary:
      "记录 2.4 版本中的权限继承、引用溯源、批量标签和问答置信度展示能力，适合售前和支持团队引用。",
    category: "产品资料",
    owner: "产品平台组",
    status: "synced",
    source: "产品发布文档",
    confidence: 0.88,
    createdAt: "2026-05-02",
    updatedAt: "2026-05-27",
    tags: ["Release", "权限", "引用"],
    chunks: [
      {
        id: "pr-1",
        title: "权限继承",
        content:
          "知识集合支持继承组织权限，管理员仍可在单条知识上设置例外规则。例外规则会在详情页标记，便于审计。",
        createdAt: "2026-05-20"
      },
      {
        id: "pr-2",
        title: "引用溯源",
        content:
          "智能问答会返回命中的知识片段标题、来源和更新时间。低置信度回答会显示建议人工复核。",
        createdAt: "2026-05-20"
      }
    ],
    relatedQuestions: [
      "2.4 版本新增了哪些权限能力？",
      "智能问答如何展示引用来源？"
    ]
  },
  {
    id: "sales-objection-library",
    title: "销售异议处理话术库",
    summary:
      "围绕价格、部署周期、数据安全和现有系统替换成本整理常见异议，并给出可复用的回应框架。",
    category: "销售赋能",
    owner: "商业化团队",
    status: "processing",
    source: "销售通话转写",
    confidence: 0.74,
    createdAt: "2026-05-05",
    updatedAt: "2026-05-30",
    tags: ["话术", "异议", "安全"],
    chunks: [
      {
        id: "so-1",
        title: "价格异议",
        speaker: "销售顾问",
        content:
          "当客户只比较订阅价格时，先回到知识检索节省的人力成本，再补充实施周期和后续维护投入的总体成本。",
        createdAt: "2026-05-24"
      },
      {
        id: "so-2",
        title: "安全异议",
        speaker: "安全负责人",
        content:
          "回答安全问题时不要泛泛承诺，应说明权限边界、数据隔离、审计日志和可选私有化部署路径。",
        createdAt: "2026-05-25"
      }
    ],
    relatedQuestions: [
      "客户觉得价格高时怎么回应？",
      "如何解释数据安全能力？"
    ]
  },
  {
    id: "support-incident-faq",
    title: "客服高频故障 FAQ",
    summary:
      "汇总登录异常、知识同步延迟、问答无引用、附件解析失败等支持场景，包含排查路径和升级标准。",
    category: "客服支持",
    owner: "支持中心",
    status: "stale",
    source: "工单系统",
    confidence: 0.81,
    createdAt: "2026-03-28",
    updatedAt: "2026-05-14",
    tags: ["FAQ", "工单", "排障"],
    chunks: [
      {
        id: "sf-1",
        title: "同步延迟",
        content:
          "若知识同步超过十分钟，先检查来源连接器状态，再查看任务队列是否存在失败重试。仍未恢复时升级到平台值班。",
        createdAt: "2026-04-30"
      },
      {
        id: "sf-2",
        title: "问答无引用",
        content:
          "问答无引用通常由知识权限不可见、内容尚未索引或问题过于宽泛造成。客服应先确认用户权限和知识更新时间。",
        createdAt: "2026-05-02"
      }
    ],
    relatedQuestions: [
      "知识同步延迟应该如何排查？",
      "问答没有引用来源时该怎么处理？"
    ]
  }
];

export const feedRecords: FeedRecord[] = [
  {
    id: "feed-1001",
    title: "华东客户 Q2 复盘会议",
    source: "会议转写",
    contentPreview: "客户希望在六月底前完成第二批部门上线，重点关注权限审批和搜索命中率。",
    tags: ["客户成功", "复盘"],
    status: "completed",
    createdAt: "2026-05-31 10:22"
  },
  {
    id: "feed-1002",
    title: "销售安全异议录音",
    source: "通话转写",
    contentPreview: "客户提出数据隔离、日志审计、私有化部署周期等问题，需要沉淀标准答复。",
    tags: ["销售赋能", "安全"],
    status: "processing",
    createdAt: "2026-05-31 15:46"
  },
  {
    id: "feed-1003",
    title: "客服附件解析失败工单",
    source: "Zendesk",
    contentPreview: "用户上传的扫描 PDF 未被解析，客服通过重新 OCR 和手动补录解决。",
    tags: ["客服支持", "附件"],
    status: "queued",
    createdAt: "2026-06-01 09:15"
  }
];
