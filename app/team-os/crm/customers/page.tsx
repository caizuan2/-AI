import { CrmDashboardPage } from "@/apps/team-os/features/crm/pages/CrmDashboardPage";
import {
  CUSTOMER_LEVELS,
  CUSTOMER_STAGES,
  type CustomerLevel,
  type CustomerStage
} from "@/apps/team-os/features/crm/types";

export const metadata = { title: "客户中心 | AI Team OS" };

export default function CrmCustomersPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const value = (key: string) => {
    const current = searchParams?.[key];
    return Array.isArray(current) ? current[0] : current;
  };
  const stage = value("stage");
  const level = value("level");
  return (
    <CrmDashboardPage
      initialFilters={{
        companyId: value("companyId"),
        teamId: value("teamId"),
        stage: CUSTOMER_STAGES.includes(stage as CustomerStage) ? stage as CustomerStage : undefined,
        level: CUSTOMER_LEVELS.includes(level as CustomerLevel) ? level as CustomerLevel : undefined,
        tag: value("tag")
      }}
    />
  );
}
