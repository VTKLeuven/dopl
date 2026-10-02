-- CreateEnum
CREATE TYPE "MailIgnoreField" AS ENUM ('SENDER', 'SUBJECT');

-- CreateTable
CREATE TABLE "mail_ignore_rules" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "mailboxId" UUID NOT NULL,
    "field" "MailIgnoreField" NOT NULL,
    "value" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_ignore_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mail_ignore_rules_mailboxId_field_value_key" ON "mail_ignore_rules"("mailboxId", "field", "value");

-- AddForeignKey
ALTER TABLE "mail_ignore_rules" ADD CONSTRAINT "mail_ignore_rules_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_ignore_rules" ADD CONSTRAINT "mail_ignore_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
