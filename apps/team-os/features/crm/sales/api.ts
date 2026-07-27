import "server-only";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getAuditRequestContext } from "@/lib/audit-log";
import { ValidationError } from "@/lib/errors";
import { requireTeamOsAccess } from "@/apps/team-os/features/auth/services/team-os-access";
import {
  parseChangeCrmOpportunityStageInput,
  parseChangeCrmContractStatusInput,
  parseConvertCrmLeadInput,
  parseCreateCrmContractInput,
  parseCreateCrmLeadInput,
  parseCreateCrmOpportunityInput,
  parseCreateCrmReceivableInput,
  parseCrmContractListFilters,
  parseCrmEntityId,
  parseCrmLeadListFilters,
  parseCrmOpportunityListFilters,
  parseCrmReceivableListFilters,
  parseRecordCrmPaymentInput,
  parseUpdateCrmLeadInput
} from "@/apps/team-os/features/crm/sales/input";
import {
  changeCrmOpportunityStage,
  changeCrmContractStatus,
  convertCrmLead,
  createCrmContract,
  createCrmLead,
  createCrmOpportunity,
  createCrmReceivable,
  getCrmSalesDashboard,
  listCrmContracts,
  listCrmLeads,
  listCrmOpportunities,
  listCrmReceivables,
  recordCrmPayment,
  updateCrmLead
} from "@/apps/team-os/features/crm/sales/repository";
import type {
  CrmSalesActor,
  CrmSalesAuditContext
} from "@/apps/team-os/features/crm/sales/types";

async function readJson(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new ValidationError("请求必须使用 application/json。");
  }
  try {
    return await request.json() as unknown;
  } catch {
    throw new ValidationError("请求体不是有效 JSON。");
  }
}

async function requireCrmActor(request: Request): Promise<CrmSalesActor> {
  const user = await requireTeamOsAccess(request, "crm");
  return {
    userId: user.id,
    companyId: user.companyId,
    teamRole: user.role
  };
}

function auditContext(request: Request): CrmSalesAuditContext {
  return getAuditRequestContext(request);
}

export async function handleCrmSalesDashboardGet(request: Request) {
  try {
    const actor = await requireCrmActor(request);
    return apiSuccess(await getCrmSalesDashboard(actor));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmLeadsGet(request: Request) {
  try {
    const actor = await requireCrmActor(request);
    const filters = parseCrmLeadListFilters(new URL(request.url).searchParams);
    return apiSuccess(await listCrmLeads(actor, filters));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmLeadPost(request: Request) {
  try {
    const actor = await requireCrmActor(request);
    const input = parseCreateCrmLeadInput(await readJson(request));
    return apiSuccess(await createCrmLead(actor, auditContext(request), input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmLeadPatch(request: Request, rawLeadId: string) {
  try {
    const actor = await requireCrmActor(request);
    const leadId = parseCrmEntityId(rawLeadId, "线索 ID");
    const input = parseUpdateCrmLeadInput(await readJson(request));
    return apiSuccess(await updateCrmLead(actor, auditContext(request), leadId, input));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmLeadConvertPost(request: Request, rawLeadId: string) {
  try {
    const actor = await requireCrmActor(request);
    const leadId = parseCrmEntityId(rawLeadId, "线索 ID");
    const input = parseConvertCrmLeadInput(await readJson(request));
    return apiSuccess(await convertCrmLead(actor, auditContext(request), leadId, input), {
      status: 201
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmOpportunitiesGet(request: Request) {
  try {
    const actor = await requireCrmActor(request);
    const filters = parseCrmOpportunityListFilters(new URL(request.url).searchParams);
    return apiSuccess(await listCrmOpportunities(actor, filters));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmOpportunityPost(request: Request) {
  try {
    const actor = await requireCrmActor(request);
    const input = parseCreateCrmOpportunityInput(await readJson(request));
    return apiSuccess(
      await createCrmOpportunity(actor, auditContext(request), input),
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmOpportunityStagePost(
  request: Request,
  rawOpportunityId: string
) {
  try {
    const actor = await requireCrmActor(request);
    const opportunityId = parseCrmEntityId(rawOpportunityId, "商机 ID");
    const input = parseChangeCrmOpportunityStageInput(await readJson(request));
    return apiSuccess(
      await changeCrmOpportunityStage(
        actor,
        auditContext(request),
        opportunityId,
        input
      )
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmContractsGet(request: Request) {
  try {
    const actor = await requireCrmActor(request);
    const filters = parseCrmContractListFilters(new URL(request.url).searchParams);
    return apiSuccess(await listCrmContracts(actor, filters));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmContractPost(request: Request) {
  try {
    const actor = await requireCrmActor(request);
    const input = parseCreateCrmContractInput(await readJson(request));
    return apiSuccess(await createCrmContract(actor, auditContext(request), input), {
      status: 201
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmContractStatusPatch(
  request: Request,
  rawContractId: string
) {
  try {
    const actor = await requireCrmActor(request);
    const contractId = parseCrmEntityId(rawContractId, "合同 ID");
    const input = parseChangeCrmContractStatusInput(await readJson(request));
    return apiSuccess(
      await changeCrmContractStatus(actor, auditContext(request), contractId, input)
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmReceivablesGet(request: Request) {
  try {
    const actor = await requireCrmActor(request);
    const filters = parseCrmReceivableListFilters(new URL(request.url).searchParams);
    return apiSuccess(await listCrmReceivables(actor, filters));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmReceivablePost(request: Request) {
  try {
    const actor = await requireCrmActor(request);
    const input = parseCreateCrmReceivableInput(await readJson(request));
    return apiSuccess(await createCrmReceivable(actor, auditContext(request), input), {
      status: 201
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmReceivablePaymentPost(
  request: Request,
  rawReceivableId: string
) {
  try {
    const actor = await requireCrmActor(request);
    const receivableId = parseCrmEntityId(rawReceivableId, "应收记录 ID");
    const input = parseRecordCrmPaymentInput(await readJson(request));
    return apiSuccess(
      await recordCrmPayment(actor, auditContext(request), receivableId, input)
    );
  } catch (error) {
    return apiError(error);
  }
}
