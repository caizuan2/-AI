import { IngestEXEAgentList } from "@/components/enterprise-admin/IngestEXEAgentList";
import { IngestEXESidebar } from "@/components/enterprise-admin/IngestEXESidebar";
import { IngestEXEWorkspace } from "@/components/enterprise-admin/IngestEXEWorkspace";
import {
  ingestEXEAgents,
  ingestEXECollections,
  ingestEXEGeneratedBlocks,
  ingestEXENavItems,
  ingestEXEReviewItems,
  ingestEXETasks,
  ingestEXETools
} from "@/lib/enterprise/mock-ingest";

export function IngestEXEShell() {
  return (
    <main className="h-screen overflow-hidden bg-[#f7f7f6] text-[#191919]">
      <div className="mx-auto flex h-screen max-w-[1600px] overflow-hidden border-x border-[#e8e8e6] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <IngestEXESidebar items={ingestEXENavItems} />
        <IngestEXEAgentList agents={ingestEXEAgents} collections={ingestEXECollections} tasks={ingestEXETasks} />
        <IngestEXEWorkspace blocks={ingestEXEGeneratedBlocks} reviewItems={ingestEXEReviewItems} tools={ingestEXETools} />
      </div>
    </main>
  );
}
