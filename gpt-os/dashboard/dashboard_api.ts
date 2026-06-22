import { buildDashboardCore } from "./dashboard_core";
import { buildOverviewApi } from "./overview_api";
import type { DashboardSnapshotInput } from "./dashboard_types";

export function buildDashboardApiResponse(input: DashboardSnapshotInput) {
  const dashboard = buildDashboardCore(input);

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    overview: buildOverviewApi(input),
    dashboard,
  };
}
