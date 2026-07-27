import { CustomerDetailPage } from "@/apps/team-os/features/crm/pages/CustomerDetailPage";
import {
  CUSTOMER_LEVELS,
  CUSTOMER_STAGES,
  type CustomerLevel,
  type CustomerStage
} from "@/apps/team-os/features/crm/types";

export const metadata = { title: "客户详情 | AI Team OS" };

export default function CustomerDetailRoute({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const value = (key: string) => {
    const current = searchParams?.[key];
    return Array.isArray(current) ? current[0] : current;
  };
  const stage = value("stage");
  const level = value("level");
  return (
    <CustomerDetailPage
      customerId={params.id}
      returnCompanyId={value("companyId")}
      returnTeamId={value("teamId")}
      returnStage={CUSTOMER_STAGES.includes(stage as CustomerStage) ? stage as CustomerStage : undefined}
      returnLevel={CUSTOMER_LEVELS.includes(level as CustomerLevel) ? level as CustomerLevel : undefined}
      returnTag={value("tag")}
    />
  );
}
