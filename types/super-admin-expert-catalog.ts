export type ExpertCatalogStatus = "active" | "hidden" | "archived";

export type ExpertCatalogZone = {
  id: string;
  zoneKey: string;
  displayName: string;
  status: ExpertCatalogStatus;
  sortOrder: number;
  builtIn: boolean;
  agentCount: number;
};

export type ExpertCatalogAgent = {
  id: string;
  agentKey: string;
  displayName: string;
  knowledgeBaseId: string;
  namespace: string;
  protectedBinding: boolean;
  zoneId: string;
  zoneKey: string;
  zoneName: string;
  status: ExpertCatalogStatus;
  sortOrder: number;
  aliases: string[];
  avatar: string | null;
  description: string | null;
  builtIn: boolean;
};

export type ExpertCatalogSnapshot = {
  agents: ExpertCatalogAgent[];
  zones: ExpertCatalogZone[];
  protectedAgentKeys: string[];
};

export type CreateExpertCatalogAgentInput = {
  displayName: string;
  knowledgeBaseId: string;
  zoneKey: string;
  description?: string | null;
  avatar?: string | null;
  aliases?: string[];
};

export type UpdateExpertCatalogAgentInput = {
  displayName?: string;
  zoneKey?: string;
  status?: ExpertCatalogStatus;
  sortOrder?: number;
  description?: string | null;
  avatar?: string | null;
  aliases?: string[];
};

export type CreateExpertCatalogZoneInput = {
  displayName: string;
};

export type UpdateExpertCatalogZoneInput = {
  displayName?: string;
  status?: ExpertCatalogStatus;
  sortOrder?: number;
};
