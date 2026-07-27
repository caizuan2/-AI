import {
  handleCrmIntegrationCreate,
  handleCrmIntegrationsGet
} from "@/apps/team-os/features/crm/operations/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleCrmIntegrationsGet;
export const POST = handleCrmIntegrationCreate;
