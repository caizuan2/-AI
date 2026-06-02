import type { Config, Context } from "@netlify/functions";
import { prisma } from "../../lib/prisma-client";
import { checkStaleKnowledgeTask } from "../../lib/jobs/tasks";

export const config: Config = {
  schedule: "0 18 * * *"
};

export default async function handler(_request: Request, _context: Context) {
  try {
    const result = await checkStaleKnowledgeTask();

    return Response.json({
      success: true,
      task: "check-stale-knowledge",
      result
    });
  } finally {
    await prisma.$disconnect();
  }
}

