export const TEAM_OS_RELEASE = {
  product: "AI Team OS",
  version: "1.0.0",
  buildNumber: "2026071301",
  releaseDate: "2026-07-13"
} as const;

export type TeamOsRuntimeEnvironment =
  | "development"
  | "test"
  | "staging"
  | "production"
  | "unknown";

export function getTeamOsRuntimeEnvironment(
  env: Record<string, string | undefined> = process.env
): TeamOsRuntimeEnvironment {
  const configured = (env.TEAM_OS_ENVIRONMENT ?? env.NODE_ENV ?? "")
    .trim()
    .toLowerCase();

  if (
    configured === "development" ||
    configured === "test" ||
    configured === "staging" ||
    configured === "production"
  ) {
    return configured;
  }

  return "unknown";
}

export function getTeamOsVersionInfo(
  env: Record<string, string | undefined> = process.env
) {
  return {
    ...TEAM_OS_RELEASE,
    environment: getTeamOsRuntimeEnvironment(env)
  } as const;
}
