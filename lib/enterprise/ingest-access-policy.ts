export type IngestAccessTier = "none" | "chat_only" | "full_ingest";

export type IngestCapabilities = {
  enterPortal: boolean;
  chat: boolean;
  aiControl: boolean;
  trainingMemory: boolean;
  saveKnowledge: boolean;
};

export type IngestAccessFacts = {
  isActive: boolean;
  isSuperAdmin: boolean;
  hasPrivilegedIngestRole: boolean;
  hasActiveIngestLicense: boolean;
  hasActiveUserLicense: boolean;
  hasLegacyUserLicense: boolean;
};

const CAPABILITIES_BY_TIER: Record<IngestAccessTier, IngestCapabilities> = {
  none: {
    enterPortal: false,
    chat: false,
    aiControl: false,
    trainingMemory: false,
    saveKnowledge: false
  },
  chat_only: {
    enterPortal: true,
    chat: true,
    aiControl: false,
    trainingMemory: false,
    saveKnowledge: false
  },
  full_ingest: {
    enterPortal: true,
    chat: true,
    aiControl: true,
    trainingMemory: true,
    saveKnowledge: true
  }
};

export function capabilitiesForIngestTier(tier: IngestAccessTier): IngestCapabilities {
  return { ...CAPABILITIES_BY_TIER[tier] };
}

export function resolveIngestAccessTierFromFacts(facts: IngestAccessFacts): IngestAccessTier {
  if (!facts.isActive) {
    return "none";
  }

  if (
    facts.isSuperAdmin
    || (facts.hasPrivilegedIngestRole && facts.hasActiveIngestLicense)
  ) {
    return "full_ingest";
  }

  if (
    facts.hasActiveUserLicense
    || (!facts.hasPrivilegedIngestRole && facts.hasLegacyUserLicense)
  ) {
    return "chat_only";
  }

  return "none";
}
