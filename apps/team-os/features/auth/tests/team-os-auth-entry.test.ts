import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import {
  TEAM_OS_ACTIVATE_PATH,
  TEAM_OS_HOME_PATH,
  TEAM_OS_INVITE_PATH,
  TEAM_OS_LOGIN_PATH,
  TEAM_OS_PLATFORM_LICENSES_PATH,
  TEAM_OS_PUBLIC_ENTRIES,
  TEAM_OS_REGISTER_PATH
} from "@/apps/team-os/features/auth/constants";
import {
  getSafeTeamOsNextPath,
  isTeamOsInvitationNextPath
} from "@/apps/team-os/features/auth/utils/team-os-next-path";
import { middleware } from "@/middleware";

async function run() {
  assert.equal(getSafeTeamOsNextPath(null), TEAM_OS_HOME_PATH);
  assert.equal(getSafeTeamOsNextPath("https://example.com"), TEAM_OS_HOME_PATH);
  assert.equal(getSafeTeamOsNextPath("//example.com"), TEAM_OS_HOME_PATH);
  assert.equal(getSafeTeamOsNextPath("/login"), TEAM_OS_HOME_PATH);
  assert.equal(getSafeTeamOsNextPath(TEAM_OS_LOGIN_PATH), TEAM_OS_HOME_PATH);
  assert.equal(getSafeTeamOsNextPath(TEAM_OS_REGISTER_PATH), TEAM_OS_HOME_PATH);
  assert.equal(getSafeTeamOsNextPath(TEAM_OS_ACTIVATE_PATH), TEAM_OS_HOME_PATH);
  assert.equal(getSafeTeamOsNextPath(`${TEAM_OS_INVITE_PATH}/invite-code`), `${TEAM_OS_INVITE_PATH}/invite-code`);
  assert.equal(isTeamOsInvitationNextPath(`${TEAM_OS_INVITE_PATH}/invite-code`), true);
  assert.equal(isTeamOsInvitationNextPath(`${TEAM_OS_INVITE_PATH}/invite-code/extra`), false);
  assert.equal(getSafeTeamOsNextPath(TEAM_OS_PLATFORM_LICENSES_PATH), TEAM_OS_HOME_PATH);
  assert.equal(getSafeTeamOsNextPath("/team-os/tasks?scope=my"), "/team-os/tasks?scope=my");

  const protectedResponse = await middleware(new NextRequest("http://localhost/team-os"));
  assert.equal(protectedResponse.status, 307);
  const protectedLocation = new URL(protectedResponse.headers.get("location") ?? "http://invalid");
  assert.equal(protectedLocation.pathname, TEAM_OS_LOGIN_PATH);
  assert.equal(protectedLocation.searchParams.get("next"), TEAM_OS_HOME_PATH);

  const teamLoginResponse = await middleware(new NextRequest("http://localhost/team-os/login"));
  assert.equal(teamLoginResponse.status, 200);
  assert.equal(teamLoginResponse.headers.get("location"), null);
  assert.equal(
    teamLoginResponse.headers.get("x-middleware-request-x-ai-team-os-public-entry"),
    TEAM_OS_PUBLIC_ENTRIES.login
  );

  for (const publicPath of [
    TEAM_OS_REGISTER_PATH,
    TEAM_OS_ACTIVATE_PATH,
    TEAM_OS_INVITE_PATH,
    `${TEAM_OS_INVITE_PATH}/invite-code`,
    TEAM_OS_PLATFORM_LICENSES_PATH
  ]) {
    const response = await middleware(new NextRequest(`http://localhost${publicPath}`));
    assert.equal(response.status, 200, `${publicPath} should bypass the protected Team OS layout guard.`);
    assert.equal(response.headers.get("location"), null);
    assert.ok(
      response.headers.get("x-middleware-request-x-ai-team-os-public-entry"),
      `${publicPath} should receive a trusted internal entry marker.`
    );
  }

  const nestedInviteResponse = await middleware(
    new NextRequest(`http://localhost${TEAM_OS_INVITE_PATH}/invite-code/extra`)
  );
  assert.equal(nestedInviteResponse.status, 307);
  assert.equal(
    new URL(nestedInviteResponse.headers.get("location") ?? "http://invalid").pathname,
    TEAM_OS_LOGIN_PATH
  );

  const spoofedHeaderResponse = await middleware(
    new NextRequest("http://localhost/team-os/tasks", {
      headers: {
        "x-ai-team-os-public-entry": "login"
      }
    })
  );
  assert.equal(spoofedHeaderResponse.status, 307);
  assert.equal(
    new URL(spoofedHeaderResponse.headers.get("location") ?? "http://invalid").pathname,
    TEAM_OS_LOGIN_PATH
  );

  const spoofedPublicHeaderResponse = await middleware(
    new NextRequest(`http://localhost${TEAM_OS_REGISTER_PATH}`, {
      headers: {
        "x-ai-team-os-public-entry": TEAM_OS_PUBLIC_ENTRIES.login
      }
    })
  );
  assert.equal(
    spoofedPublicHeaderResponse.headers.get("x-middleware-request-x-ai-team-os-public-entry"),
    TEAM_OS_PUBLIC_ENTRIES.register
  );

  const legacyLoginResponse = await middleware(new NextRequest("http://localhost/login"));
  assert.equal(legacyLoginResponse.status, 200);
  assert.equal(legacyLoginResponse.headers.get("location"), null);

  for (const legacyPublicPath of [
    "/register",
    "/ingest/login",
    "/ingest/register",
    "/ingest/activate"
  ]) {
    const response = await middleware(new NextRequest(`http://localhost${legacyPublicPath}`));
    assert.equal(response.status, 200, `${legacyPublicPath} must remain public.`);
    assert.equal(response.headers.get("location"), null);
  }

  const legacyUnlockResponse = await middleware(new NextRequest("http://localhost/unlock"));
  assert.equal(legacyUnlockResponse.status, 307);
  assert.equal(
    new URL(legacyUnlockResponse.headers.get("location") ?? "http://invalid").pathname,
    "/login"
  );

  const legacyProtectedResponse = await middleware(new NextRequest("http://localhost/app"));
  assert.equal(legacyProtectedResponse.status, 307);
  assert.equal(new URL(legacyProtectedResponse.headers.get("location") ?? "http://invalid").pathname, "/login");

  const publicRegistrationApi = await middleware(new NextRequest("http://localhost/api/team-os/auth/register", {
    method: "POST"
  }));
  assert.equal(publicRegistrationApi.status, 200);

  const publicInvitationApi = await middleware(new NextRequest(
    "http://localhost/api/team-os/auth/invitations/invite-code"
  ));
  assert.equal(publicInvitationApi.status, 200);

  const publicStatusApi = await middleware(new NextRequest("http://localhost/api/team-os/status"));
  assert.equal(publicStatusApi.status, 200);

  for (const protectedApiRequest of [
    new NextRequest("http://localhost/api/team-os/auth/register"),
    new NextRequest("http://localhost/api/team-os/auth/access"),
    new NextRequest("http://localhost/api/team-os/auth/activate", { method: "POST" }),
    new NextRequest("http://localhost/api/team-os/auth/invitations/invite-code", { method: "POST" }),
    new NextRequest("http://localhost/api/team-os/platform/licenses")
  ]) {
    const response = await middleware(protectedApiRequest);
    assert.equal(response.status, 401);
  }

  const isolatedApiFiles = [
    "apps/team-os/features/ai-brain/services/ai-brain-api.ts",
    "apps/team-os/features/ai-coach/services/ai-coach-api.ts",
    "apps/team-os/features/analytics/services/analytics-api.ts",
    "apps/team-os/features/copilot/services/copilot-api.ts",
    "apps/team-os/features/crm/services/crm-api.ts",
    "apps/team-os/features/industry-coach/services/industry-coach-api.ts",
    "apps/team-os/features/notification/services/notification-api.ts",
    "apps/team-os/features/organization/services/organization-api.ts",
    "apps/team-os/features/tasks/services/task-api.ts",
    "apps/team-os/features/tenant/services/tenant-api.ts",
    "apps/team-os/features/training/services/training-api.ts",
    "apps/team-os/features/workflow/services/workflow-api.ts"
  ];

  for (const apiFile of isolatedApiFiles) {
    const source = readFileSync(apiFile, "utf8");
    assert.match(source, /requireTeamOsAccess/);
    assert.doesNotMatch(source, /requireUserAppAccess/);
  }

  const featureApiFiles: Array<[string, string]> = [
    ["apps/team-os/features/ai-brain/services/ai-brain-api.ts", "knowledge"],
    ["apps/team-os/features/ai-coach/services/ai-coach-api.ts", "ai_coach"],
    ["apps/team-os/features/analytics/services/analytics-api.ts", "analytics"],
    ["apps/team-os/features/copilot/services/copilot-api.ts", "ai_coach"],
    ["apps/team-os/features/crm/services/crm-api.ts", "crm"],
    ["apps/team-os/features/industry-coach/services/industry-coach-api.ts", "ai_coach"],
    ["apps/team-os/features/tasks/services/task-api.ts", "tasks"],
    ["apps/team-os/features/training/services/training-api.ts", "training"],
    ["apps/team-os/features/workflow/services/workflow-api.ts", "tasks"]
  ];
  for (const [apiFile, featureKey] of featureApiFiles) {
    assert.ok(
      readFileSync(apiFile, "utf8").includes(`requireTeamOsAccess(request, "${featureKey}")`),
      `${apiFile} must enforce its subscription feature.`
    );
  }

  const accessSource = readFileSync(
    "apps/team-os/features/auth/services/team-os-access.ts",
    "utf8"
  );
  assert.match(accessSource, /MULTI_COMPANY_MEMBERSHIP_CONFLICT/);
  assert.match(accessSource, /featurePermissions/);

  console.log("AI Team OS auth entry tests passed.");
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
