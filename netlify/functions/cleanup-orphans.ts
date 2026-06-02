import type { Config, Context } from "@netlify/functions";
import { prisma } from "../../lib/prisma";
import { cleanupOrphanChunksTask } from "../../lib/jobs/tasks";

export const config: Config = {
  schedule: "0 20 * * *"
};

export default async function handler(_request: Request, _context: Context) {
  try {
    const result = await cleanupOrphanChunksTask();

    return Response.json({
      success: true,
      task: "cleanup-orphan-chunks",
      result
    });
  } finally {
    await prisma.$disconnect();
  }
}
