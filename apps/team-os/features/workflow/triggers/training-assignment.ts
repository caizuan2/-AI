import { NotFoundError, ValidationError } from "@/lib/errors";

export function selectTrainingFinishedAssignment<T extends { id: string; teamId: string }>(
  assignments: readonly T[],
  hasTeamScope: boolean
) {
  const assignment = assignments[0];
  if (!assignment) {
    throw new NotFoundError("培训记录没有当前工作流可访问的团队安排。");
  }
  if (!hasTeamScope && assignments.length > 1) {
    throw new ValidationError("该培训记录关联多个团队安排，请将工作流绑定到具体团队后再执行。");
  }
  return assignment;
}
