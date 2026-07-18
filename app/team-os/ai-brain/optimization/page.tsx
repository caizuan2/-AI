import { AiBrainOptimizationPage } from "@/apps/team-os/features/ai-brain/pages";

export const metadata = { title: "知识优化中心 | AI Team OS" };

export default function AiBrainOptimizationRoute({ searchParams }: {
  searchParams?: { companyId?: string | string[] };
}) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <AiBrainOptimizationPage initialCompanyId={companyId} />;
}
