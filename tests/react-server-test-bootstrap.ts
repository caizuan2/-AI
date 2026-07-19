import { spawnSync } from "node:child_process";

export function ensureReactServerTestRuntime(testFile: string) {
  if (process.execArgv.includes("--conditions=react-server")) {
    return;
  }

  const result = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", testFile],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: false
    }
  );

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}
