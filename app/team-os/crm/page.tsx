import { CrmDashboardPage } from "@/apps/team-os/features/crm/pages/CrmDashboardPage";
import { CUSTOMER_LEVELS, CUSTOMER_STAGES, type CustomerLevel, type CustomerStage } from "@/apps/team-os/features/crm/types";

export const metadata = { title: "AI CRM | AI Team OS" };

export default function CrmPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const value = (key: string) => typeof searchParams?.[key] === "string" ? searchParams[key] as string : undefined;
  const stageValue = value("stage");
  const levelValue = value("level");
  return (
    <CrmDashboardPage
      initialFilters={{
        companyId: value("companyId"),
        teamId: value("teamId"),
        stage: CUSTOMER_STAGES.includes(stageValue as CustomerStage) ? stageValue as CustomerStage : undefined,
        level: CUSTOMER_LEVELS.includes(levelValue as CustomerLevel) ? levelValue as CustomerLevel : undefined,
        tag: value("tag")
      }}
    />
  );
}
