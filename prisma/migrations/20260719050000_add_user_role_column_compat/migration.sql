BEGIN;

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ingest_admin';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'enterprise_admin';

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'user';

DO $$
DECLARE
  role_type TEXT;
BEGIN
  SELECT columns.udt_name
  INTO role_type
  FROM information_schema.columns
  WHERE columns.table_schema = 'public'
    AND columns.table_name = 'users'
    AND columns.column_name = 'role';

  IF role_type IS DISTINCT FROM 'UserRole' THEN
    RAISE EXCEPTION 'users.role must use UserRole, found %', COALESCE(role_type, 'missing');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users"("role");

COMMIT;
