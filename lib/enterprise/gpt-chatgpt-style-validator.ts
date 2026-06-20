import type { GptKnowledgeDraft } from "@/lib/enterprise/gpt-knowledge-draft";

export const GPT_CHATGPT_STYLE_FORBIDDEN_PHRASES = [
  "已收到投喂资料",
  "可沉淀的知识点",
  "训练价值评分",
  "标准主题",
  "入库建议",
  "本地预览结构化结果",
  "当前可沉淀的信息",
  "建议整理成标准问答",
  "适合打的标签"
];

export function findTemplateStylePhrases(text: string) {
  return GPT_CHATGPT_STYLE_FORBIDDEN_PHRASES.filter((phrase) => text.includes(phrase));
}

function compactText(value: string, fallback: string, maxLength = 220) {
  const text = value.replace(/\s+/g, " ").trim() || fallback;

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function isPriceObjection(input: string) {
  return /贵|价格|太贵|报价|费用|便宜|优惠|值不值/.test(input);
}

function isLearningSummary(input: string, draft: GptKnowledgeDraft) {
  return /学习|总结|PPT|ppt|分享|培训|招商|梦想家园|控体|减脂|脂达人|用户端|入库/.test(`${input} ${draft.title} ${draft.summary} ${draft.sourceMaterials.join(" ")}`);
}

function isProDepthIngestRequest(input: string, draft: GptKnowledgeDraft) {
  return /学习|总结|优化|后期|入库|用户端|调用|招商|控体|减脂|脂达人|大健康/.test(`${input} ${draft.title} ${draft.summary} ${draft.category} ${draft.tags.join(" ")} ${draft.sourceMaterials.join(" ")}`);
}

function hasProDepthSignals(reply: string) {
  return [
    "大健康控体行业知识库",
    "一线销售话术库",
    "售后答疑库",
    "招商会转化库",
    "用户端调用策略",
    "合规风控",
    "入库优先级"
  ].every((item) => reply.includes(item));
}

function buildProDepthReply(input: string, draft: GptKnowledgeDraft, suggestedQuestions: string[] = []) {
  const source = draft.sourceMaterials.length ? draft.sourceMaterials.join("、") : "本次上传资料";
  const tags = draft.tags.length ? draft.tags.join("、") : "体重管理、客户沟通、售后答疑、合规边界";
  const questions = suggestedQuestions.length ? suggestedQuestions : [
    "能否继续把资料拆成 100 条标准问答？",
    "能否把招商会内容拆成 20 条可复制话术？",
    "能否把售后异常反应整理成 SOP？"
  ];

  return [
    "可以，我先按 ChatGPT Pro 的知识生产方式来拆。你这次不是在让我“总结两个文件”，而是在建立一套后续能被用户端检索、理解、二次推理和安全调用的行业知识底座。",
    "",
    "我的总判断是：这批资料不应该被当成单纯的产品说明书保存。它更像是四套知识的组合：**大健康控体行业知识库**、**一线销售话术库**、**售后答疑库**、**招商会转化库**。如果只把它压缩成几条摘要，用户端以后能检索到内容，但回答会很浅；真正有价值的做法，是把资料拆成“认知逻辑、使用方法、客户疑问、风险边界、成交场景、售后处理”几层，让 GPT 在用户提问时能先检索，再结合上下文二次思考。",
    "",
    `从当前资料看，核心来源是：${source}。我会把它先归入「${draft.category}」，当前标签可以先用：${tags}。但保存时不要只保存文件名，要保存 GPT 深度处理后的知识：标准问法、可调用答案、适用人群、禁忌边界、场景话术和来源材料。`,
    "",
    "### 我建议这样分层",
    "",
    "1. **产品基础层**：包括产品构成、核心卖点、使用阶段、饮水/饮食配合、周期说明。这里解决的是“它是什么、怎么用、适合什么目标”。",
    "2. **科学控体认知层**：重点解释为什么不能只靠饿瘦、为什么要关注代谢、营养、肠道和稳定期。这层用于回答客户的底层疑问，避免话术显得像硬推产品。",
    "3. **人群适配层**：把普通体重管理人群、慢病相关风险人群、高尿酸/痛风/高血糖、孕妇、老人、儿童、服药人群拆开，分别设置可说与不可说边界。",
    "4. **常见反应处理层**：头晕、心慌、便秘、腹泻、平台期、经期等问题不能只回答“正常”，要给出观察、补水、饮食、暂停、咨询专业人士等处理路径。",
    "5. **客户异议处理层**：例如会不会反弹、是不是智商税、能不能替代吃饭、是不是药、有没有副作用。这部分适合沉淀成一线销售话术库。",
    "6. **招商会转化层**：招商会资料的价值不只是介绍产品，而是建立信任、展示真实案例、解释趋势、帮助代理理解身材管理为什么能成为流量入口。",
    "7. **合规风控层**：这是必须单独入库的一层，未来用户端回答任何控体问题都要先加载这层边界。",
    "",
    "### 用户端调用策略",
    "",
    "用户端不应该背诵原文，也不应该直接照搬招商会话术。更好的回答链路是：**共情客户问题 → 解释科学逻辑 → 给产品相关建议 → 加注意事项 → 引导评估/咨询**。例如用户问“喝了会不会反弹”，用户端应该先承认这个担心很常见，再解释反弹通常和极端节食、恢复原饮食、没有稳定期有关，然后结合资料里的阶段管理和稳定期逻辑给建议，最后提醒效果因人而异，不做绝对承诺。",
    "",
    "### 示例问答",
    "",
    "**客户问：会不会反弹？**  \n可以这样答：你担心反弹很正常。真正容易反弹的通常不是“体重下降”本身，而是用极端节食、脱水或短期强压方式让体重掉下去，后面一恢复原来的饮食和作息就反弹。更稳的做法是把控体拆成启动、过渡、稳定几个阶段，同时关注营养补充、饮水、饮食顺序和生活习惯。具体适不适合你，还要结合你的身体情况和目标来评估。",
    "",
    "**客户问：高血糖/痛风/高尿酸能不能用？**  \n可以这样答：这类情况不能简单一句“能”或“不能”。如果你有高血糖、痛风、高尿酸，或者正在用药，建议先把你的基础情况、医生建议和当前指标说清楚，再由专业人士判断是否适合参与体重管理方案。我们可以提供饮食顺序、饮水、营养管理等通用建议，但不能替代医疗诊断或治疗。",
    "",
    "**客户问：喝了头晕怎么办？**  \n可以这样答：先不要慌，头晕可能和饮水不足、进食太少、作息、低血糖倾向或个体适应有关。建议先暂停强度较高的调整，补充水分，确认当天有没有按建议进食。如果症状明显、持续或本身有基础疾病，应及时咨询医生。后续再根据你的状态调整节奏，而不是硬扛。",
    "",
    "### 合规风控",
    "",
    "这批知识未来给用户端调用时，必须固定加载这些边界：不承诺具体减重结果；不说治疗疾病；不把案例当作普遍结果；不替代医生建议；孕妇、儿童、老人、慢病、服药、痛风、高尿酸、高血糖等人群必须提示遵医嘱或先做专业评估。招商会内容可以讲趋势、案例和方法论，但不能制造焦虑或做绝对化收益承诺。",
    "",
    "### 入库优先级",
    "",
    "第一批优先入库：产品基础问答、33/77 循环与阶段说明、常见反应处理、反弹/平台期/便秘腹泻/头晕等高频售后问题、合规禁忌边界。它们会直接影响用户端回答质量。第二批再入库：招商会转化话术、案例讲解框架、代理分享脚本、身材与事业场景表达。第三批可以继续拆成销售 SOP、售后 SOP、风险提醒卡和用户自评问题。",
    "",
    "如果给 Agent 分配，我建议：产品 Agent 负责产品构成和用法；客服 Agent 负责客户疑问和异议处理；售后 Agent 负责异常反应与周期跟进；销售 Agent 负责招商会转化和一线话术；制度/合规类 Agent 保存禁忌表达和风险边界。",
    "",
    "下一步，我建议把这批资料继续拆成三组：**100 条标准问答**、**20 条销售/招商话术**、**20 条售后 SOP**。我已经在后台生成结构化草稿，你可以点“查看结构化结果”确认字段，再决定是否保存进知识库。",
    "",
    "你后面可以继续让我：",
    ...questions.slice(0, 4).map((question) => `- ${question}`)
  ].join("\n");
}

function buildOpening(input: string, draft: GptKnowledgeDraft) {
  if (isPriceObjection(input)) {
    return "可以，我先按一线人员真实沟通的角度来拆。客户说“太贵”时，表面是在谈价格，实际通常是在判断三件事：值不值、风险大不大、有没有更划算的选择。所以回应时不要急着解释成本或降价，先接住顾虑，再把价值和适用场景说清楚。";
  }

  if (isLearningSummary(input, draft)) {
    return `可以，我先帮你从这份资料里抓核心逻辑。它不是简单的资料归档，更像是一套“怎么把内容讲清楚、讲可信、讲到对方愿意继续了解”的分享脚本。当前我能抓到的核心是：${compactText(draft.summary, input, 260)}。`;
  }

  return `可以，我先按「一线人员能直接用」的角度帮你梳理。当前这段内容的核心是：${compactText(draft.summary, input, 180)}。我会先给你一版自然话术和处理思路，结构化草稿会放在后台，方便你确认后再保存。`;
}

function buildTalkTrack(input: string, draft: GptKnowledgeDraft) {
  if (isPriceObjection(input)) {
    return [
      "你可以这样回应客户：",
      "",
      "> 我理解你会先看价格，这个反应很正常。我们不建议你只看“花了多少钱”，更建议你看它能不能解决你现在最关心的问题，以及后续能不能少走弯路。你可以先告诉我，你主要担心的是预算压力、效果不确定，还是怕买了之后用不上？我先根据你的情况帮你判断值不值得做。",
      "",
      "这段话的重点是先承认客户的感受，再把话题从“贵不贵”转到“适不适合、能不能解决问题”。这样比直接说产品有多好更容易让客户继续聊下去。"
    ].join("\n");
  }

  if (isLearningSummary(input, draft)) {
    return [
      "我建议你可以这样理解和复用这份资料：",
      "",
      "1. **先讲真实经历，再讲产品和价值**：这类分享最怕一上来就像广告。更稳的顺序是先讲人、场景和变化，再自然带到产品、系统学习和事业机会。",
      "2. **把对象分清楚**：如果面对新联创会员，重点要讲清楚“为什么值得听、怎么开始、怎么避免走偏”；如果面对领导人，重点要讲“怎样复制、怎样带团队、怎样形成标准动作”。",
      "3. **不要夸大，不要欺骗**：这点适合沉淀成培训红线。分享可以有感染力，但不能用绝对化承诺、夸大收益或制造焦虑来推动成交。",
      "4. **提炼成可复制公式**：真实经历引入 → 当前痛点/机会 → 产品与价值 → 系统学习路径 → 适合谁继续了解 → 下一步行动。",
      "",
      "如果给一线人员用，可以改成这样的讲法：",
      "",
      "> 你不用一开始就把所有产品讲完，先把自己的真实经历讲清楚：我为什么接触、过程中学到了什么、它对我的生活或事业判断产生了什么影响。然后再说明梦想家园不是靠夸大承诺吸引人，而是靠系统学习、真实分享和持续行动，让合适的人找到自己的节奏。"
    ].join("\n");
  }

  return [
    "我建议先这样处理：",
    "",
    `> ${compactText(draft.standardAnswer, draft.summary || input, 360)}`,
    "",
    "这版话术先保证一线人员能直接复制使用。如果你后面补充更多业务背景，我可以继续帮你改成客服版、销售版或售后 SOP 版。"
  ].join("\n");
}

function buildKnowledgeHint(draft: GptKnowledgeDraft) {
  const tags = draft.tags.length > 0 ? draft.tags.slice(0, 4).join("、") : "待补充标签";
  const missing = draft.missingFields.length > 0 ? draft.missingFields.slice(0, 3).join("、") : "";

  return [
    "从知识库角度看，后台可以先生成一份草稿，重点保存这几类内容：客户真实疑问、推荐回应话术、适用场景、后续补充项。",
    `我会先把草稿归到「${draft.category}」，标签暂定为：${tags}。`,
    missing ? `不过正式保存前，最好再补一下：${missing}。` : "如果你认可这版口径，可以直接点“查看结构化结果”确认字段，再保存到知识库。"
  ].filter(Boolean).join("\n\n");
}

export function buildChatGptStyleReply(input: {
  originalInput: string;
  draft: GptKnowledgeDraft;
  suggestedQuestions?: string[];
  fallbackNote?: string;
}) {
  const questions = input.suggestedQuestions?.length
    ? input.suggestedQuestions
    : [
      "客户主要觉得哪里贵，是总价、单次投入，还是和竞品对比后觉得不值？",
      "这个产品最核心的差异点是什么？",
      "一线人员有没有真实成交或售后案例可以引用？"
    ];

  return [
    buildOpening(input.originalInput, input.draft),
    "",
    buildTalkTrack(input.originalInput, input.draft),
    "",
    buildKnowledgeHint(input.draft),
    "",
    "接下来你可以继续补充：",
    ...questions.slice(0, 4).map((question) => `- ${question}`),
    "",
    input.fallbackNote ? `另外说明一下：${input.fallbackNote}` : "",
    "我已经在后台同步生成了一份可保存草稿，你可以点“查看结构化结果”检查标题、分类和标准问答，再决定是否保存。"
  ].filter(Boolean).join("\n");
}

export function ensureChatGptStyleReply(input: {
  replyMarkdown: string;
  originalInput: string;
  draft: GptKnowledgeDraft;
  suggestedQuestions?: string[];
}) {
  const reply = input.replyMarkdown.trim();

  if (isProDepthIngestRequest(input.originalInput, input.draft) && (reply.length < 1200 || !hasProDepthSignals(reply) || findTemplateStylePhrases(reply).length > 0)) {
    return buildProDepthReply(input.originalInput, input.draft, input.suggestedQuestions);
  }

  if (!reply || findTemplateStylePhrases(reply).length > 0) {
    return buildChatGptStyleReply({
      originalInput: input.originalInput,
      draft: input.draft,
      suggestedQuestions: input.suggestedQuestions
    });
  }

  return reply;
}
