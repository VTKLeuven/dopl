-- AlterTable
ALTER TABLE "outbound_emails" ADD COLUMN     "intakeItemId" UUID;

-- CreateIndex
CREATE INDEX "outbound_emails_intakeItemId_idx" ON "outbound_emails"("intakeItemId");
