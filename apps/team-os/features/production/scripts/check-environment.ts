import {
  formatTeamOsEnvironmentReport,
  validateTeamOsProductionEnvironment
} from "@/apps/team-os/features/production/services/environment";

const report = validateTeamOsProductionEnvironment(process.env);

for (const line of formatTeamOsEnvironmentReport(report)) {
  console.log(line);
}

if (!report.ok) {
  console.error("AI Team OS production environment check failed.");
  process.exitCode = 1;
} else {
  console.log(`AI Team OS production environment is ready for provider: ${report.provider}.`);
}
