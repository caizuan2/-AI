import type { Config, Context } from "@netlify/functions";
import { prisma } from "../../lib/prisma";
import { refreshLowQualitySuggestionsTask } from "../../lib/jobs/tasks";

export const config: Config = {
  schedule: "15 19 * * *"
};

export default async function handler(_request: Request, _context: Context) {
  try {
    const result = await refreshLowQualitySuggestionsTask(5);

    return Response.json({
      success: true,
      task: "refresh-low-quality-suggestions",
      result
    });
  } finally {
    await prisma.$disconnect();
  }
}
