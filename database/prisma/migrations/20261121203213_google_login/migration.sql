-- AlterTable
ALTER TABLE "users" ADD COLUMN     "googleSub" TEXT,
ADD COLUMN     "phoneVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "users_googleSub_key" ON "users"("googleSub");


-- Accounts created through phone OTP proved their number.
UPDATE "users" SET "phoneVerified" = true WHERE "phone" IS NOT NULL AND "authProvider" = 'PHONE_OTP';
