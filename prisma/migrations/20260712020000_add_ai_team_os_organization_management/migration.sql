-- Preflight
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "team_organizations" AS organization
    WHERE NOT EXISTS (
      SELECT 1
      FROM "team_members" AS member
      WHERE member."team_id" = organization."id"
    )
  ) THEN
    RAISE EXCEPTION 'Cannot assign owner_id: team organization has no members';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "TeamOrganizationStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "TeamMemberStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TeamInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "team_organizations"
ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN "owner_id" TEXT,
ADD COLUMN "status" "TeamOrganizationStatus" NOT NULL DEFAULT 'ACTIVE';

UPDATE "team_organizations" AS organization
SET "owner_id" = COALESCE(
  (
    SELECT member."user_id"
    FROM "team_members" AS member
    WHERE member."team_id" = organization."id"
      AND member."role" = 'TEAM_OWNER'
    ORDER BY member."created_at" ASC, member."id" ASC
    LIMIT 1
  ),
  (
    SELECT member."user_id"
    FROM "team_members" AS member
    WHERE member."team_id" = organization."id"
      AND member."role" = 'TEAM_MANAGER'
    ORDER BY member."created_at" ASC, member."id" ASC
    LIMIT 1
  ),
  (
    SELECT member."user_id"
    FROM "team_members" AS member
    WHERE member."team_id" = organization."id"
    ORDER BY member."created_at" ASC, member."id" ASC
    LIMIT 1
  )
);

ALTER TABLE "team_organizations"
ALTER COLUMN "owner_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "team_members"
ADD COLUMN "status" "TeamMemberStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "updated_at" TIMESTAMP(3);

UPDATE "team_members"
SET "updated_at" = "created_at";

ALTER TABLE "team_members"
ALTER COLUMN "updated_at" SET NOT NULL;

-- CreateTable
CREATE TABLE "team_invitations" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'TEAM_MEMBER',
    "invite_code" TEXT NOT NULL,
    "status" "TeamInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_organizations_owner_id_idx" ON "team_organizations"("owner_id");

-- CreateIndex
CREATE INDEX "team_organizations_status_idx" ON "team_organizations"("status");

-- CreateIndex
CREATE INDEX "team_members_status_idx" ON "team_members"("status");

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_invite_code_key" ON "team_invitations"("invite_code");

-- CreateIndex
CREATE INDEX "team_invitations_team_id_idx" ON "team_invitations"("team_id");

-- CreateIndex
CREATE INDEX "team_invitations_email_idx" ON "team_invitations"("email");

-- CreateIndex
CREATE INDEX "team_invitations_status_idx" ON "team_invitations"("status");

-- CreateIndex
CREATE INDEX "team_invitations_expires_at_idx" ON "team_invitations"("expires_at");

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
