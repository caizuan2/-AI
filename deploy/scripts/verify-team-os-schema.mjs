import { Prisma, PrismaClient } from "@prisma/client";

const requiredColumns = new Map([
  ["team_organizations", ["id", "company_id", "owner_id", "status"]],
  ["team_members", ["id", "team_id", "user_id", "role", "status"]],
  ["team_os_tenant_companies", ["id", "owner_id", "status"]],
  ["team_os_tenant_subscriptions", ["id", "company_id", "plan_id", "status"]],
  ["team_os_subscription_plans", ["id", "max_users", "features", "status"]],
  ["team_os_feature_permissions", ["plan_id", "feature_key", "enabled"]],
  ["team_tasks", ["id", "team_id", "creator_id", "status"]],
  ["task_submissions", ["id", "task_id", "user_id", "status"]],
  ["crm_customers", ["id", "company_id", "team_id", "owner_id", "stage"]],
  ["training_courses", ["id", "company_id", "status"]],
  ["workflow_definitions", ["id", "company_id", "team_id", "status"]],
  ["team_os_notifications", ["id", "company_id", "user_id", "read_status"]],
  ["team_os_integration_configs", ["id", "company_id", "provider", "enabled"]],
  ["team_os_knowledge_candidates", ["id", "company_id", "team_id", "status"]],
]);

const prisma = new PrismaClient();

try {
  const tableNames = [...requiredColumns.keys()];
  const rows = await prisma.$queryRaw(
    Prisma.sql`
      SELECT table_name AS "tableName", column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name IN (${Prisma.join(tableNames)})
    `
  );

  const actual = new Map();
  for (const row of rows) {
    if (!actual.has(row.tableName)) actual.set(row.tableName, new Set());
    actual.get(row.tableName).add(row.columnName);
  }

  const missing = [];
  for (const [tableName, columns] of requiredColumns) {
    const actualColumns = actual.get(tableName) ?? new Set();
    const missingColumns = columns.filter((column) => !actualColumns.has(column));
    if (missingColumns.length > 0) missing.push({ tableName, missingColumns });
  }

  if (missing.length > 0) {
    console.error(JSON.stringify({ ok: false, code: "TEAM_OS_SCHEMA_NOT_READY", missing }));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ ok: true, checkedTables: requiredColumns.size }));
  }
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      code: "TEAM_OS_SCHEMA_CHECK_FAILED",
      errorName: error instanceof Error ? error.name : "UnknownError",
    })
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
