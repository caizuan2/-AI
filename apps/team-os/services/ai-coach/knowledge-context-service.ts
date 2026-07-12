import "server-only";

import { searchKnowledgeChunks } from "@/lib/knowledge/search";

export type KnowledgeContextMode =
  | "personal-and-enterprise-shared"
  | "unavailable"
  | "no-match";

export interface KnowledgeContextResult {
  mode: KnowledgeContextMode;
  promptContext: string;
}

function compactText(value: string, maxLength: number) {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length <= maxLength ? compacted : `${compacted.slice(0, maxLength)}…`;
}

function buildSalesKnowledgeQuery(conversation: string) {
  const prefix = "销售流程 产品知识 标准话术 客户沟通分析 ";
  const compacted = conversation.replace(/\s+/g, " ").trim();
  const availableLength = 1_000 - prefix.length;
  return `${prefix}${compacted.slice(-availableLength)}`.trim();
}

export class KnowledgeContextService {
  async getAccessibleContext(input: {
    conversation: string;
    actorUserId: string;
    actorTenantId: string | null;
    teamCompanyId: string;
  }): Promise<KnowledgeContextResult> {
    const enterpriseScopeAllowed = Boolean(
      input.actorTenantId && input.actorTenantId === input.teamCompanyId
    );
    if (!enterpriseScopeAllowed) {
      return {
        mode: "unavailable",
        promptContext: "当前团队未绑定与员工一致的企业租户，本次不使用知识库上下文。"
      };
    }

    const searchQuery = buildSalesKnowledgeQuery(input.conversation);
    const response = await searchKnowledgeChunks(
      searchQuery,
      5,
      input.actorUserId,
      {
        tenantId: input.actorTenantId
      }
    );

    if (response.results.length === 0) {
      return {
        mode: "no-match",
        promptContext: "未找到与本次沟通直接相关的员工可访问知识。"
      };
    }

    const entries = response.results.map((chunk, index) => {
      const body = compactText(chunk.chunkText || chunk.summary, 1_400);
      return `${index + 1}. ${compactText(chunk.title, 160)}\n分类：${compactText(chunk.category, 80)}\n内容：${body}`;
    });

    return {
      mode: "personal-and-enterprise-shared",
      promptContext: `以下内容来自该员工有权访问的知识（个人知识 + 当前企业共享知识），仅用于对照销售标准：\n${entries.join("\n\n")}`
    };
  }
}
