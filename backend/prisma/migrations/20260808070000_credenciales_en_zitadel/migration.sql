-- AlterTable
ALTER TABLE "users" DROP COLUMN "password_hash",
ADD COLUMN     "external_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_external_id_key" ON "users"("external_id");

