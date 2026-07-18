import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  TEAM_OS_HOME_PATH,
  TEAM_OS_LOGIN_PATH
} from "@/apps/team-os/features/auth/constants";
import { getSafeTeamOsNextPath } from "@/apps/team-os/features/auth/utils/team-os-next-path";
import { middleware } from "@/middleware";

async function run() {
  assert.equal(getSafeTeamOsNextPath(null), TEAM_OS_HOME_PATH);
  assert.equal(getSafeTeamOsNextPath("https://example.com"), TEAM_OS_HOME_PATH);
  assert.equal(getSafeTeamOsNextPath("//example.com"), TEAM_OS_HOME_PATH);
  assert.equal(getSafeTeamOsNextPath("/login"), TEAM_OS_HOME_PATH);
  assert.equal(getSafeTeamOsNextPath(TEAM_OS_LOGIN_PATH), TEAM_OS_HOME_PATH);
  assert.equal(getSafeTeamOsNextPath("/team-os/tasks?scope=my"), "/team-os/tasks?scope=my");

  const protectedResponse = await middleware(new NextRequest("http://localhost/team-os"));
  assert.equal(protectedResponse.status, 307);
  const protectedLocation = new URL(protectedResponse.headers.get("location") ?? "http://invalid");
  assert.equal(protectedLocation.pathname, TEAM_OS_LOGIN_PATH);
  assert.equal(protectedLocation.searchParams.get("next"), TEAM_OS_HOME_PATH);

  const teamLoginResponse = await middleware(new NextRequest("http://localhost/team-os/login"));
  assert.equal(teamLoginResponse.status, 200);
  assert.equal(teamLoginResponse.headers.get("location"), null);

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

  const legacyLoginResponse = await middleware(new NextRequest("http://localhost/login"));
  assert.equal(legacyLoginResponse.status, 200);
  assert.equal(legacyLoginResponse.headers.get("location"), null);

  const legacyProtectedResponse = await middleware(new NextRequest("http://localhost/app"));
  assert.equal(legacyProtectedResponse.status, 307);
  assert.equal(new URL(legacyProtectedResponse.headers.get("location") ?? "http://invalid").pathname, "/login");

  console.log("AI Team OS auth entry tests passed.");
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
