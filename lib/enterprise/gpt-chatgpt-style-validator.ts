import type { GptKnowledgeDraft } from "@/lib/enterprise/gpt-knowledge-draft";

export const GPT_CHATGPT_STYLE_FORBIDDEN_PHRASES = [
  "已收到投喂资料",
  "可沉淀的知识点",
  "训练价值评分",
  "标准主题",
  "入库建议",
  "复制到投喂版",
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

  if (!reply) {
    return buildChatGptStyleReply({
      originalInput: input.originalInput,
      draft: input.draft,
      suggestedQuestions: input.suggestedQuestions
    });
  }

  return reply;
}
