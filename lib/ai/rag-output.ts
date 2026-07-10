const sourceMetadataLinePattern =
  /^\s*(?:[-*•>]\s*)?(?:🔍|📌|📎|🧾|✅)?\s*(?:\*\*)?\s*(?:依据来源|引用来源|资料来源|参考来源|来源说明|课程来源|检索来源|命中文档|出处|引用依据|来源)(?:\*\*)?\s*[:：].*$/i;

const courseMetadataLinePattern =
  /^\s*(?:[-*•>]\s*)?(?:不同课程对比|课程对比|版本(?:更换|切换|更新)|违规更换|更换版本|课程版本)(?:说明)?\s*[:：].*$/i;

const courseMechanismLinePattern =
  /^\s*(?:[-*•>]\s*)?.*(?:所有课程|课程体系|课程融合|底层标准化框架|标准化框架|写死为机制|不可拆分|不可跳步|不可拆分或跳步).*$/;

const inlineSourceMetadataPatterns: RegExp[] = [
  /这版回答已结合[^。；\n]*(?:资料|来源|引用面板)[^。；\n]*(?:[。；]\s*)?/g,
  /(?:具体来源|来源)(?:仍)?保留在(?:引用)?面板中[。；]?\s*/g,
  /(?:根据|依据|基于)[^，。；\n]*(?:知识库|课程|课件|讲稿|文档|资料|导师|老师)[^，。；\n]*[，,：:]\s*/g,
  /(?:^|\s)(?:🔍|📌|📎|🧾|✅)?\s*(?:\*\*)?\s*(?:依据来源|引用来源|资料来源|参考来源|来源说明|课程来源|检索来源|命中文档|出处|引用依据|来源)(?:\*\*)?\s*[:：][^\n]*/gi,
  /(?:该|这个|以上|下面)?(?:结构|内容|方法|流程|话术|答案|资料)?\s*(?:源自|来自|出自|摘自|引用自|参考自|采自|整理自)[^。；;\n]*(?:[。；;]\s*)?/g,
  /(?:见|参见|参考|引用)?\s*(?:检索文档|命中文档|知识片段|资料片段)\s*[:：]?\s*[\w\s/.-]+/gi,
  /(?:根据|依据|基于)\s*[《「“]?[^，。；\n]{0,80}?(?:知识库|课程|课件|讲稿|文档|资料|导师|老师)[^，。；\n]{0,120}?[》」”]?(?:中(?:的)?|显示|记录|标准(?:课程)?结构|内容|资料)?[，,：:]?\s*/g,
  /[^，。；\n]{0,30}(?:老师|导师)(?:说|讲过|提到|强调|指出)\s*[:：，,]?\s*/g,
  /(?:\(|（)?\s*(?:见|参考)?\s*(?:检索文档|命中文档|引用文档|资料编号)[^()（）\n]*(?:\)|）)?/gi
];

const inlineCourseMechanismPatterns: Array<[RegExp, string]> = [
  [/[（(][^（）()\n]*(?:思路课|梦想家园|六大价值|市场赋能|课程融合|课程体系|标准课程)[^（）()\n]*[）)]/g, ""],
  [/[（(]\s*(?:标准结构|标准化结构|标准课程结构|标准机制|底层框架)\s*[）)]/g, ""],
  [/(?:所有|全部|各类)?课程(?:体系|融合|结构|规范)?/g, ""],
  [/(?:底层)?标准化框架/g, ""],
  [/(?:已)?写死为机制/g, ""],
  [/不可拆分或跳步|不可拆分|不可跳步/g, ""],
  [/必须严格遵循(?:的)?/g, ""],
  [/标准结构/g, ""]
];

const inlineMachineTokenPatterns: RegExp[] = [
  /\bpub-[a-z0-9-]+(?:\s*\/\s*pub-[a-z0-9-]+)*/gi,
  /\b(?:chunk|chunkId|chunk_id|sourceId|source_id|fileId|file_id|itemId|item_id)\s*[:：=#-]?\s*[\w:-]+/gi,
  /\b(?:score|similarity|rank|relevance_score|citationIndex|sourceTitle|sourceType)\s*[:：=]\s*[\w.%-]+/gi
];

function removeSourceMetadataLines(value: string) {
  return value
    .split("\n")
    .filter((line) => (
      !sourceMetadataLinePattern.test(line) &&
      !courseMetadataLinePattern.test(line) &&
      !courseMechanismLinePattern.test(line)
    ))
    .join("\n");
}

function normalizeUserFacingWhitespace(value: string) {
  return value
    .replace(/[ \t]+([，。；：！？])/g, "$1")
    .replace(/[，,]\s*[，,；;：:]+/g, "，")
    .replace(/([，。；：！？])\s+\1+/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/（\s*）/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanUserFacingRagAnswer(answer: string) {
  let text = answer
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n");

  text = removeSourceMetadataLines(text);

  for (const pattern of inlineSourceMetadataPatterns) {
    text = text.replace(pattern, "");
  }

  for (const [pattern, replacement] of inlineCourseMechanismPatterns) {
    text = text.replace(pattern, replacement);
  }

  for (const pattern of inlineMachineTokenPatterns) {
    text = text.replace(pattern, "");
  }

  return normalizeUserFacingWhitespace(text
    .replace(/\s*\[\d+\]/g, "")
    .replace(/根据知识库(?:显示|资料|内容)?[，,：:]?\s*/g, "")
    .replace(/根据检索结果[，,：:]?\s*/g, "")
    .replace(/根据提供的上下文[，,：:]?\s*/g, "")
    .replace(/综上所述[，,。]?\s*/g, "")
    .replace(/作为(?:一个)?\s*AI[，,，。]?\s*/gi, "")
    .replace(/只找到\s*\d+\s*条相关知识[，,。；;]?\s*/g, "")
    .replace(/少于请求的\s*\d+\s*条[，,。；;]?\s*/g, "")
    .replace(/已找到\s*\d+\s*条相关(?:候选)?知识(?:，其中\s*\d+\s*条用于回答)?[，,。；;]?\s*/g, ""));
}
