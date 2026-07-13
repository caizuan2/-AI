import { AiBrainCandidatesPage } from "@/apps/team-os/features/ai-brain/pages";

export const metadata = { title: "候选知识审核 | AI Team OS" };

export default function AiBrainCandidatesRoute({ searchParams }: {
  searchParams?: { companyId?: string | string[] };
}) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <AiBrainCandidatesPage initialCompanyId={companyId} />;
}
