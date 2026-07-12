import { Badge } from "@/components/ui/badge";
import { CUSTOMER_LEVEL_LABELS, CUSTOMER_RISK_LABELS, CUSTOMER_STAGE_LABELS } from "@/apps/team-os/features/crm/components/crm-ui";
import type { CustomerLevel, CustomerRiskLevel, CustomerStage } from "@/apps/team-os/features/crm/types";

export function CustomerStageBadge({ stage }: { stage: CustomerStage }) {
  const variant = stage === "CUSTOMER" ? "default" : stage === "LOST" ? "secondary" : stage === "NEGOTIATING" ? "warning" : "outline";
  return <Badge variant={variant}>{CUSTOMER_STAGE_LABELS[stage]}</Badge>;
}

export function CustomerLevelBadge({ level }: { level: CustomerLevel }) {
  return <Badge variant={level === "HIGH" ? "warning" : level === "LOW" ? "secondary" : "outline"}>{CUSTOMER_LEVEL_LABELS[level]}价值</Badge>;
}

export function CustomerRiskBadge({ riskLevel }: { riskLevel: CustomerRiskLevel }) {
  return <Badge variant={riskLevel === "HIGH" ? "warning" : riskLevel === "LOW" ? "default" : "outline"}>{CUSTOMER_RISK_LABELS[riskLevel]}</Badge>;
}
