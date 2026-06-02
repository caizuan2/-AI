ALTER TABLE "users"
ADD COLUMN "phone" TEXT;

ALTER TABLE "users"
ALTER COLUMN "email" DROP NOT NULL;

CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
