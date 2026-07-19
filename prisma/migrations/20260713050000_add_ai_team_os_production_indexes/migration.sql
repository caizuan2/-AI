-- Add query-shaped indexes for AI Team OS production access paths.
CREATE INDEX "team_organizations_company_status_created_idx"
ON "team_organizations"("company_id", "status", "created_at");

CREATE INDEX "team_members_team_status_created_idx"
ON "team_members"("team_id", "status", "created_at");

CREATE INDEX "team_members_user_status_created_idx"
ON "team_members"("user_id", "status", "created_at");

CREATE INDEX "team_invitations_team_status_expires_idx"
ON "team_invitations"("team_id", "status", "expires_at");

CREATE INDEX "team_os_tenant_subscriptions_company_created_idx"
ON "team_os_tenant_subscriptions"("company_id", "created_at");

CREATE INDEX "team_tasks_team_status_deadline_created_idx"
ON "team_tasks"("team_id", "status", "deadline", "created_at");

CREATE INDEX "task_submissions_user_created_idx"
ON "task_submissions"("user_id", "created_at");
