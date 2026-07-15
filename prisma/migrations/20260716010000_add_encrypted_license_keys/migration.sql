ALTER TABLE "license_keys"
ADD COLUMN "encrypted_key" TEXT,
ADD COLUMN "encryption_key_version" INTEGER;
