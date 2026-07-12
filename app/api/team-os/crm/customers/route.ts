import {
  handleCrmCustomerCreate,
  handleCrmCustomersGet
} from "@/apps/team-os/features/crm/services/crm-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleCrmCustomersGet(request);
}

export function POST(request: Request) {
  return handleCrmCustomerCreate(request);
}
