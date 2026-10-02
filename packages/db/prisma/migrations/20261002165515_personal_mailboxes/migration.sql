-- AlterTable
ALTER TABLE "mailboxes" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ownerId" UUID;

-- CreateIndex
CREATE INDEX "mailboxes_ownerId_idx" ON "mailboxes"("ownerId");

-- AddForeignKey
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
