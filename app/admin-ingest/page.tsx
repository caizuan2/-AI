import type { Metadata } from "next";
import { IngestModeToggle } from "@/components/enterprise-admin/IngestModeToggle";
import { getCurrentUser } from "@/lib/auth";
import { resolveIngestAccessTier } from "@/lib/enterprise/ingest-access-tier";

export const metadata: Metadata = {
  title: "AI知识库投喂端 | Admin Ingest",
  description: "企业级 AI 投喂工作台"
};

export default async function AdminIngestPage() {
  const user = await getCurrentUser().catch(() => null);

  if (!user) {
    return null;
  }

  const access = await resolveIngestAccessTier(user);

  return (
    <IngestModeToggle
      accessTier={access.accessTier}
      capabilities={access.capabilities}
    />
  );
}
