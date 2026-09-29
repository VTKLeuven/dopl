-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserKind" AS ENUM ('HUMAN', 'AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'GUEST');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('ADMIN', 'MEMBER', 'GUEST');

-- CreateEnum
CREATE TYPE "ProjectVisibility" AS ENUM ('WORKSPACE', 'PRIVATE');

-- CreateEnum
CREATE TYPE "EstimateSystem" AS ENUM ('NONE', 'POINTS', 'HOURS');

-- CreateEnum
CREATE TYPE "StateGroup" AS ENUM ('TRIAGE', 'BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('BLOCKS', 'RELATES_TO', 'DUPLICATE_OF');

-- CreateEnum
CREATE TYPE "ItemOrigin" AS ENUM ('APP', 'INTAKE_FORM', 'INTAKE_GUEST', 'EMAIL', 'MESSAGE', 'NOTE', 'AGENT', 'API', 'IMPORT');

-- CreateEnum
CREATE TYPE "SubscriptionReason" AS ENUM ('CREATOR', 'ASSIGNEE', 'MENTIONED', 'COMMENTER', 'MANUAL');

-- CreateEnum
CREATE TYPE "CommentVisibility" AS ENUM ('INTERNAL', 'PUBLIC');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'READY', 'QUARANTINED', 'FAILED');

-- CreateEnum
CREATE TYPE "ViewLayout" AS ENUM ('LIST', 'BOARD', 'CALENDAR', 'TABLE', 'TIMELINE');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PRIVATE', 'WORKSPACE');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "IntakeSource" AS ENUM ('IN_APP', 'FORM', 'EMAIL', 'API');

-- CreateEnum
CREATE TYPE "FormFieldType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'SELECT', 'MULTI_SELECT', 'DATE', 'FILE', 'EMAIL', 'CHECKBOX');

-- CreateEnum
CREATE TYPE "FormFieldTarget" AS ENUM ('NONE', 'TITLE', 'DESCRIPTION', 'PRIORITY', 'TYPE', 'LABELS', 'DUE_DATE', 'CONTACT_EMAIL', 'CONTACT_NAME');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MENTION', 'ASSIGNED', 'WORK_ITEM_UPDATED', 'COMMENT', 'INTAKE_SUBMITTED', 'INTAKE_REPLY', 'AGENT_APPROVAL_REQUESTED', 'AGENT_RUN_FINISHED', 'EMAIL_ASSIGNED', 'EMAIL_MENTION', 'EMAIL_REPLY', 'DUE_SOON', 'SNOOZE_ENDED');

-- CreateEnum
CREATE TYPE "OutboundStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PresenceState" AS ENUM ('VIEWING', 'TYPING', 'REPLYING');

-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('PROJECT', 'CUSTOM', 'DM', 'GROUP_DM');

-- CreateEnum
CREATE TYPE "ChannelRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "ChannelNotifyLevel" AS ENUM ('ALL', 'MENTIONS', 'NONE');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('USER', 'SYSTEM', 'AGENT');

-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('PRIVATE', 'WORKSPACE');

-- CreateEnum
CREATE TYPE "MailProvider" AS ENUM ('GMAIL');

-- CreateEnum
CREATE TYPE "MailboxStatus" AS ENUM ('CONNECTING', 'BACKFILLING', 'ACTIVE', 'PAUSED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "MailboxSyncKind" AS ENUM ('BACKFILL', 'PARTIAL', 'FULL_RESYNC', 'WATCH_RENEW', 'POLL');

-- CreateEnum
CREATE TYPE "EmailThreadStatus" AS ENUM ('OPEN', 'SOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "AgentRuntimeKind" AS ENUM ('HERMES');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "AgentRunTrigger" AS ENUM ('COMMENT_MENTION', 'MESSAGE_MENTION', 'DIRECT_MESSAGE', 'ASSIGNMENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_FOR_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED');

-- CreateEnum
CREATE TYPE "AgentStepKind" AS ENUM ('ASSISTANT_MESSAGE', 'TOOL_CALL', 'COMMAND', 'APPROVAL', 'STATUS', 'ERROR', 'SUBAGENT');

-- CreateEnum
CREATE TYPE "AgentStepStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'DENIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('INFRA_COMMAND', 'RUNTIME_TOOL', 'MCP_WRITE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HostEnvironment" AS ENUM ('PRODUCTION', 'STAGING', 'LAB');

-- CreateEnum
CREATE TYPE "CommandRuleKind" AS ENUM ('ALLOW_READONLY', 'DENY');

-- CreateEnum
CREATE TYPE "ApiTokenKind" AS ENUM ('MCP', 'PERSONAL');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'AGENT', 'CONTACT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReferenceKind" AS ENUM ('MENTIONED', 'LINKED', 'CREATED_FROM');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('WORKSPACE', 'MEMBER', 'PROJECT', 'STATE', 'LABEL', 'WORK_ITEM', 'COMMENT', 'VIEW', 'INTAKE_ITEM', 'INTAKE_FORM', 'CONTACT', 'CHANNEL', 'MESSAGE', 'NOTE', 'NOTE_TODO', 'MAILBOX', 'EMAIL_THREAD', 'EMAIL_MESSAGE', 'AGENT_RUN', 'AGENT_APPROVAL', 'DASHBOARD');

-- CreateEnum
CREATE TYPE "WebhookKind" AS ENUM ('DISCORD');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DROPPED');

-- CreateEnum
CREATE TYPE "ChartType" AS ENUM ('BAR', 'STACKED_BAR', 'LINE', 'AREA', 'DONUT', 'NUMBER', 'TABLE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "kind" "UserKind" NOT NULL DEFAULT 'HUMAN',
    "timezone" TEXT,
    "locale" TEXT,
    "lastActiveAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(3),
    "refreshTokenExpiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_rate_limits" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoKey" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Brussels',
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "agentPausedAt" TIMESTAMPTZ(3),
    "agentPausedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT,
    "canApproveAgentActions" BOOLEAN NOT NULL DEFAULT false,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_invites" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "projectIds" UUID[],
    "tokenHash" TEXT NOT NULL,
    "invitedById" UUID NOT NULL,
    "acceptedUserId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "previousIdentifiers" TEXT[],
    "name" TEXT NOT NULL,
    "description" JSONB,
    "icon" TEXT,
    "color" TEXT,
    "leadId" UUID,
    "visibility" "ProjectVisibility" NOT NULL DEFAULT 'WORKSPACE',
    "guestsCanViewProject" BOOLEAN NOT NULL DEFAULT false,
    "intakeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "estimateSystem" "EstimateSystem" NOT NULL DEFAULT 'NONE',
    "nextSequence" INTEGER NOT NULL DEFAULT 1,
    "nextIntakeNumber" INTEGER NOT NULL DEFAULT 1,
    "defaultViewId" UUID,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdById" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'MEMBER',
    "sortKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_states" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "group" "StateGroup" NOT NULL,
    "color" TEXT NOT NULL,
    "description" TEXT,
    "sortKey" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workflow_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_types" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortKey" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "work_item_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labels" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "description" TEXT,
    "sortKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_items" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sequence" INTEGER,
    "title" TEXT NOT NULL,
    "description" JSONB,
    "descriptionText" TEXT NOT NULL DEFAULT '',
    "stateId" UUID NOT NULL,
    "stateGroup" "StateGroup" NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'NONE',
    "typeId" UUID,
    "parentId" UUID,
    "sortKey" TEXT NOT NULL,
    "startDate" DATE,
    "dueDate" DATE,
    "estimate" DOUBLE PRECISION,
    "origin" "ItemOrigin" NOT NULL DEFAULT 'APP',
    "untrusted" BOOLEAN NOT NULL DEFAULT false,
    "trustReviewedById" UUID,
    "trustReviewedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdByContactId" UUID,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "childCount" INTEGER NOT NULL DEFAULT 0,
    "childDoneCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "attachmentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_assignees" (
    "workItemId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "assignedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_assignees_pkey" PRIMARY KEY ("workItemId","userId")
);

-- CreateTable
CREATE TABLE "work_item_labels" (
    "workItemId" UUID NOT NULL,
    "labelId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_labels_pkey" PRIMARY KEY ("workItemId","labelId")
);

-- CreateTable
CREATE TABLE "work_item_subscribers" (
    "workItemId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "reason" "SubscriptionReason" NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_subscribers_pkey" PRIMARY KEY ("workItemId","userId")
);

-- CreateTable
CREATE TABLE "work_item_relations" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "type" "RelationType" NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_links" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "workItemId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "work_item_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_references" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "workItemId" UUID NOT NULL,
    "kind" "ReferenceKind" NOT NULL,
    "sourceType" "EntityType" NOT NULL,
    "messageId" UUID,
    "noteId" UUID,
    "noteTodoId" UUID,
    "emailThreadId" UUID,
    "commentId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "workItemId" UUID NOT NULL,
    "authorId" UUID,
    "authorContactId" UUID,
    "visibility" "CommentVisibility" NOT NULL DEFAULT 'INTERNAL',
    "body" JSONB NOT NULL,
    "bodyText" TEXT NOT NULL,
    "parentId" UUID,
    "agentRunId" UUID,
    "editedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reactions" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "commentId" UUID,
    "messageId" UUID,
    "emailCommentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksumSha256" TEXT,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "width" INTEGER,
    "height" INTEGER,
    "uploadedById" UUID,
    "uploadedByContactId" UUID,
    "workItemId" UUID,
    "commentId" UUID,
    "messageId" UUID,
    "noteId" UUID,
    "intakeSubmissionId" UUID,
    "emailCommentId" UUID,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID,
    "workItemId" UUID,
    "entityType" "EntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "verb" TEXT NOT NULL,
    "field" TEXT,
    "fromValue" JSONB,
    "toValue" JSONB,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "actorType" "ActorType" NOT NULL,
    "actorId" UUID,
    "actorContactId" UUID,
    "agentRunId" UUID,
    "batchId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "views" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "layout" "ViewLayout" NOT NULL DEFAULT 'LIST',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "displayOptions" JSONB NOT NULL DEFAULT '{}',
    "sortKey" TEXT NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "view_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "layout" "ViewLayout",
    "filters" JSONB NOT NULL DEFAULT '{}',
    "displayOptions" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "view_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "sortKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recent_visits" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "visitedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recent_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "name" TEXT,
    "organization" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "userId" UUID,
    "firstSource" "ItemOrigin",
    "blockedAt" TIMESTAMPTZ(3),
    "lastSeenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_access_tokens" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "intakeItemId" UUID,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_forms" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" JSONB,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "theme" JSONB NOT NULL DEFAULT '{}',
    "createdById" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "intake_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_form_fields" (
    "id" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FormFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "helpText" TEXT,
    "placeholder" TEXT,
    "options" JSONB NOT NULL DEFAULT '[]',
    "validation" JSONB NOT NULL DEFAULT '{}',
    "target" "FormFieldTarget" NOT NULL DEFAULT 'NONE',
    "sortKey" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "intake_form_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_items" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "workItemId" UUID NOT NULL,
    "status" "IntakeStatus" NOT NULL DEFAULT 'PENDING',
    "source" "IntakeSource" NOT NULL,
    "formId" UUID,
    "submitterUserId" UUID,
    "contactId" UUID,
    "emailThreadId" UUID,
    "snoozedUntil" TIMESTAMPTZ(3),
    "duplicateOfId" UUID,
    "declineReason" TEXT,
    "triagedById" UUID,
    "triagedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "intake_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_submissions" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "intakeItemId" UUID NOT NULL,
    "contactId" UUID,
    "clientSubmissionId" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "fieldSnapshot" JSONB NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "embedOrigin" TEXT,
    "turnstileVerified" BOOLEAN NOT NULL DEFAULT false,
    "spamSignals" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "actorId" UUID,
    "type" "NotificationType" NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "projectId" UUID,
    "workItemId" UUID,
    "emailThreadId" UUID,
    "messageId" UUID,
    "agentApprovalId" UUID,
    "groupKey" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "snoozedUntil" TIMESTAMPTZ(3),
    "emailedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID,
    "type" "NotificationType" NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_emails" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "kind" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboundStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "contactId" UUID,
    "userId" UUID,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "realtime_events" (
    "id" BIGSERIAL NOT NULL,
    "workspaceId" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "realtime_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presences" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "state" "PresenceState" NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "presences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_counters" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "kind" "ChannelKind" NOT NULL,
    "projectId" UUID,
    "name" TEXT,
    "slug" TEXT,
    "topic" TEXT,
    "description" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "dmKey" TEXT,
    "createdById" UUID,
    "lastMessageAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_members" (
    "id" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "role" "ChannelRole" NOT NULL DEFAULT 'MEMBER',
    "notifyLevel" "ChannelNotifyLevel" NOT NULL DEFAULT 'ALL',
    "lastReadAt" TIMESTAMPTZ(3),
    "mutedUntil" TIMESTAMPTZ(3),
    "hiddenAt" TIMESTAMPTZ(3),
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "authorId" UUID,
    "kind" "MessageKind" NOT NULL DEFAULT 'USER',
    "threadRootId" UUID,
    "body" JSONB NOT NULL,
    "bodyText" TEXT NOT NULL,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "lastReplyAt" TIMESTAMPTZ(3),
    "agentRunId" UUID,
    "editedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_followers" (
    "messageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_followers_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "contentText" TEXT NOT NULL DEFAULT '',
    "color" TEXT,
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'PRIVATE',
    "projectId" UUID,
    "workItemId" UUID,
    "pinnedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "hasTodos" BOOLEAN NOT NULL DEFAULT false,
    "openTodoCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMPTZ(3),
    "nextReviewAt" TIMESTAMPTZ(3),
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "icon" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_tags" (
    "noteId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "note_tags_pkey" PRIMARY KEY ("noteId","tagId")
);

-- CreateTable
CREATE TABLE "note_todos" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "blockId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMPTZ(3),
    "position" INTEGER NOT NULL,
    "dueDate" DATE,
    "workItemId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "note_todos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailboxes" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "displayName" TEXT,
    "provider" "MailProvider" NOT NULL DEFAULT 'GMAIL',
    "status" "MailboxStatus" NOT NULL DEFAULT 'CONNECTING',
    "historyId" TEXT,
    "backfillDays" INTEGER NOT NULL DEFAULT 90,
    "backfillPageToken" TEXT,
    "backfillCompletedAt" TIMESTAMPTZ(3),
    "lastSyncedAt" TIMESTAMPTZ(3),
    "lastFullSyncAt" TIMESTAMPTZ(3),
    "watchExpiresAt" TIMESTAMPTZ(3),
    "syncError" TEXT,
    "syncErrorAt" TIMESTAMPTZ(3),
    "mirrorLabels" BOOLEAN NOT NULL DEFAULT false,
    "gmailLabelMap" JSONB NOT NULL DEFAULT '{}',
    "sendEnabled" BOOLEAN NOT NULL DEFAULT false,
    "intakeProjectId" UUID,
    "defaultAssigneeId" UUID,
    "createdById" UUID,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mailboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailbox_members" (
    "mailboxId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mailbox_members_pkey" PRIMARY KEY ("mailboxId","userId")
);

-- CreateTable
CREATE TABLE "mailbox_sync_logs" (
    "id" UUID NOT NULL,
    "mailboxId" UUID NOT NULL,
    "kind" "MailboxSyncKind" NOT NULL,
    "fromHistoryId" TEXT,
    "toHistoryId" TEXT,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "mailbox_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_threads" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "mailboxId" UUID NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT NOT NULL DEFAULT '',
    "status" "EmailThreadStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeId" UUID,
    "contactId" UUID,
    "snoozedUntil" TIMESTAMPTZ(3),
    "lastMessageAt" TIMESTAMPTZ(3) NOT NULL,
    "lastInboundAt" TIMESTAMPTZ(3),
    "lastOutboundAt" TIMESTAMPTZ(3),
    "firstResponseAt" TIMESTAMPTZ(3),
    "solvedAt" TIMESTAMPTZ(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "unreadInGmail" BOOLEAN NOT NULL DEFAULT false,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "gmailLabelIds" TEXT[],
    "participants" JSONB NOT NULL DEFAULT '[]',
    "deletedInGmailAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_thread_labels" (
    "threadId" UUID NOT NULL,
    "labelId" UUID NOT NULL,

    CONSTRAINT "email_thread_labels_pkey" PRIMARY KEY ("threadId","labelId")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "mailboxId" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "gmailMessageId" TEXT,
    "rfc822MessageId" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT[],
    "direction" "EmailDirection" NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "toAddresses" JSONB NOT NULL DEFAULT '[]',
    "ccAddresses" JSONB NOT NULL DEFAULT '[]',
    "bccAddresses" JSONB NOT NULL DEFAULT '[]',
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "snippet" TEXT NOT NULL DEFAULT '',
    "bodyText" TEXT,
    "bodyHtmlRaw" TEXT,
    "bodyHtmlSanitized" TEXT,
    "hasRemoteImages" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMPTZ(3) NOT NULL,
    "gmailLabelIds" TEXT[],
    "sizeEstimate" INTEGER,
    "contactId" UUID,
    "sentById" UUID,
    "outboundStatus" "OutboundStatus",
    "outboundError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_attachments" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "gmailAttachmentId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentId" TEXT,
    "isInline" BOOLEAN NOT NULL DEFAULT false,
    "storageKey" TEXT,
    "fetchedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_comments" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "authorId" UUID,
    "body" JSONB NOT NULL,
    "bodyText" TEXT NOT NULL,
    "editedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_profiles" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "runtime" "AgentRuntimeKind" NOT NULL DEFAULT 'HERMES',
    "baseUrl" TEXT NOT NULL,
    "apiKeyEnv" TEXT NOT NULL,
    "model" TEXT,
    "instructions" TEXT,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "maxConcurrentRuns" INTEGER NOT NULL DEFAULT 1,
    "runTimeoutSec" INTEGER NOT NULL DEFAULT 1800,
    "approvalTimeoutSec" INTEGER NOT NULL DEFAULT 3600,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_hosts" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "warpgateTarget" TEXT NOT NULL,
    "environment" "HostEnvironment" NOT NULL DEFAULT 'LAB',
    "description" TEXT,
    "tags" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "alwaysRequireApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_hosts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_command_rules" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "kind" "CommandRuleKind" NOT NULL,
    "pattern" TEXT NOT NULL,
    "description" TEXT,
    "hostId" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_command_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_tokens" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "ApiTokenKind" NOT NULL,
    "name" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "projectIds" UUID[],
    "expiresAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "agentUserId" UUID NOT NULL,
    "triggeredById" UUID,
    "trigger" "AgentRunTrigger" NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "prompt" TEXT NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',
    "untrusted" BOOLEAN NOT NULL DEFAULT false,
    "untrustedReasons" TEXT[],
    "taintedAt" TIMESTAMPTZ(3),
    "runTokenHash" TEXT NOT NULL,
    "runtimeRunId" TEXT,
    "runtimeSessionId" TEXT,
    "workItemId" UUID,
    "channelId" UUID,
    "triggerMessageId" UUID,
    "triggerCommentId" UUID,
    "emailThreadId" UUID,
    "result" TEXT,
    "error" TEXT,
    "usage" JSONB,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "cancelledById" UUID,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run_steps" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" "AgentStepKind" NOT NULL,
    "status" "AgentStepStatus" NOT NULL DEFAULT 'RUNNING',
    "title" TEXT,
    "toolName" TEXT,
    "input" JSONB,
    "output" TEXT,
    "outputTruncated" BOOLEAN NOT NULL DEFAULT false,
    "outputStorageKey" TEXT,
    "command" TEXT,
    "exitCode" INTEGER,
    "hostId" UUID,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "agent_run_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_approvals" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "stepId" UUID,
    "kind" "ApprovalKind" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "command" TEXT NOT NULL,
    "hostId" UUID,
    "hostSnapshot" JSONB,
    "toolName" TEXT,
    "toolArgs" JSONB,
    "agentReason" TEXT,
    "riskFlags" TEXT[],
    "runtimeRequestId" TEXT,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionNote" TEXT,

    CONSTRAINT "agent_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "actorType" "ActorType" NOT NULL,
    "actorId" UUID,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboards" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "sortKey" TEXT NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_widgets" (
    "id" UUID NOT NULL,
    "dashboardId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "chartType" "ChartType" NOT NULL,
    "metric" TEXT NOT NULL,
    "xAxis" TEXT,
    "segment" TEXT,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "options" JSONB NOT NULL DEFAULT '{}',
    "position" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dashboard_widgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_daily_stats" (
    "projectId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "workspaceId" UUID NOT NULL,
    "byStateGroup" JSONB NOT NULL,
    "byPriority" JSONB NOT NULL,
    "openCount" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL,
    "completedCount" INTEGER NOT NULL,
    "cancelledCount" INTEGER NOT NULL,
    "overdueCount" INTEGER NOT NULL,
    "intakeCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_daily_stats_pkey" PRIMARY KEY ("projectId","date")
);

-- CreateTable
CREATE TABLE "outgoing_webhooks" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "kind" "WebhookKind" NOT NULL DEFAULT 'DISCORD',
    "name" TEXT NOT NULL,
    "urlEncrypted" TEXT NOT NULL,
    "urlHint" TEXT NOT NULL,
    "events" TEXT[],
    "projectIds" UUID[],
    "mailboxIds" UUID[],
    "includeContent" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "disabledReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "outgoing_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "webhookId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "coalesceKey" TEXT,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responseStatus" INTEGER,
    "error" TEXT,
    "payload" JSONB NOT NULL,
    "notBefore" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_providerId_accountId_key" ON "accounts"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "auth_rate_limits_key_key" ON "auth_rate_limits"("key");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspace_members_userId_idx" ON "workspace_members"("userId");

-- CreateIndex
CREATE INDEX "workspace_members_workspaceId_role_idx" ON "workspace_members"("workspaceId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_invites_tokenHash_key" ON "workspace_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "workspace_invites_workspaceId_email_idx" ON "workspace_invites"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "projects_workspaceId_archivedAt_idx" ON "projects"("workspaceId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspaceId_identifier_key" ON "projects"("workspaceId", "identifier");

-- CreateIndex
CREATE INDEX "project_members_userId_workspaceId_idx" ON "project_members"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");

-- CreateIndex
CREATE INDEX "workflow_states_projectId_group_idx" ON "workflow_states"("projectId", "group");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_states_projectId_name_key" ON "workflow_states"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "work_item_types_workspaceId_projectId_name_key" ON "work_item_types"("workspaceId", "projectId", "name");

-- CreateIndex
CREATE INDEX "labels_workspaceId_idx" ON "labels"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "labels_projectId_name_key" ON "labels"("projectId", "name");

-- CreateIndex
CREATE INDEX "work_items_projectId_stateId_idx" ON "work_items"("projectId", "stateId");

-- CreateIndex
CREATE INDEX "work_items_projectId_stateGroup_idx" ON "work_items"("projectId", "stateGroup");

-- CreateIndex
CREATE INDEX "work_items_projectId_priority_idx" ON "work_items"("projectId", "priority");

-- CreateIndex
CREATE INDEX "work_items_projectId_typeId_idx" ON "work_items"("projectId", "typeId");

-- CreateIndex
CREATE INDEX "work_items_projectId_sortKey_idx" ON "work_items"("projectId", "sortKey");

-- CreateIndex
CREATE INDEX "work_items_projectId_startDate_idx" ON "work_items"("projectId", "startDate");

-- CreateIndex
CREATE INDEX "work_items_projectId_dueDate_idx" ON "work_items"("projectId", "dueDate");

-- CreateIndex
CREATE INDEX "work_items_projectId_createdAt_idx" ON "work_items"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "work_items_projectId_updatedAt_idx" ON "work_items"("projectId", "updatedAt");

-- CreateIndex
CREATE INDEX "work_items_projectId_completedAt_idx" ON "work_items"("projectId", "completedAt");

-- CreateIndex
CREATE INDEX "work_items_workspaceId_stateGroup_dueDate_idx" ON "work_items"("workspaceId", "stateGroup", "dueDate");

-- CreateIndex
CREATE INDEX "work_items_workspaceId_updatedAt_idx" ON "work_items"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "work_items_workspaceId_completedAt_idx" ON "work_items"("workspaceId", "completedAt");

-- CreateIndex
CREATE INDEX "work_items_parentId_idx" ON "work_items"("parentId");

-- CreateIndex
CREATE INDEX "work_items_createdById_idx" ON "work_items"("createdById");

-- CreateIndex
CREATE INDEX "work_items_title_idx" ON "work_items" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "work_items_projectId_sequence_key" ON "work_items"("projectId", "sequence");

-- CreateIndex
CREATE INDEX "work_item_assignees_userId_workspaceId_idx" ON "work_item_assignees"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "work_item_labels_labelId_idx" ON "work_item_labels"("labelId");

-- CreateIndex
CREATE INDEX "work_item_subscribers_userId_idx" ON "work_item_subscribers"("userId");

-- CreateIndex
CREATE INDEX "work_item_relations_targetId_type_idx" ON "work_item_relations"("targetId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "work_item_relations_sourceId_targetId_type_key" ON "work_item_relations"("sourceId", "targetId", "type");

-- CreateIndex
CREATE INDEX "work_item_links_workItemId_idx" ON "work_item_links"("workItemId");

-- CreateIndex
CREATE INDEX "work_item_references_workItemId_createdAt_idx" ON "work_item_references"("workItemId", "createdAt");

-- CreateIndex
CREATE INDEX "work_item_references_messageId_idx" ON "work_item_references"("messageId");

-- CreateIndex
CREATE INDEX "work_item_references_noteId_idx" ON "work_item_references"("noteId");

-- CreateIndex
CREATE INDEX "work_item_references_emailThreadId_idx" ON "work_item_references"("emailThreadId");

-- CreateIndex
CREATE UNIQUE INDEX "work_item_references_workItemId_messageId_key" ON "work_item_references"("workItemId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "work_item_references_workItemId_noteId_key" ON "work_item_references"("workItemId", "noteId");

-- CreateIndex
CREATE UNIQUE INDEX "work_item_references_workItemId_emailThreadId_key" ON "work_item_references"("workItemId", "emailThreadId");

-- CreateIndex
CREATE UNIQUE INDEX "work_item_references_workItemId_commentId_key" ON "work_item_references"("workItemId", "commentId");

-- CreateIndex
CREATE INDEX "comments_workItemId_createdAt_idx" ON "comments"("workItemId", "createdAt");

-- CreateIndex
CREATE INDEX "comments_authorId_idx" ON "comments"("authorId");

-- CreateIndex
CREATE INDEX "reactions_commentId_idx" ON "reactions"("commentId");

-- CreateIndex
CREATE INDEX "reactions_messageId_idx" ON "reactions"("messageId");

-- CreateIndex
CREATE INDEX "reactions_emailCommentId_idx" ON "reactions"("emailCommentId");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_userId_emoji_commentId_key" ON "reactions"("userId", "emoji", "commentId");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_userId_emoji_messageId_key" ON "reactions"("userId", "emoji", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_userId_emoji_emailCommentId_key" ON "reactions"("userId", "emoji", "emailCommentId");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storageKey_key" ON "attachments"("storageKey");

-- CreateIndex
CREATE INDEX "attachments_workItemId_idx" ON "attachments"("workItemId");

-- CreateIndex
CREATE INDEX "attachments_commentId_idx" ON "attachments"("commentId");

-- CreateIndex
CREATE INDEX "attachments_messageId_idx" ON "attachments"("messageId");

-- CreateIndex
CREATE INDEX "attachments_noteId_idx" ON "attachments"("noteId");

-- CreateIndex
CREATE INDEX "attachments_intakeSubmissionId_idx" ON "attachments"("intakeSubmissionId");

-- CreateIndex
CREATE INDEX "attachments_emailCommentId_idx" ON "attachments"("emailCommentId");

-- CreateIndex
CREATE INDEX "attachments_status_createdAt_idx" ON "attachments"("status", "createdAt");

-- CreateIndex
CREATE INDEX "activities_workItemId_createdAt_idx" ON "activities"("workItemId", "createdAt");

-- CreateIndex
CREATE INDEX "activities_entityType_entityId_createdAt_idx" ON "activities"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "activities_workspaceId_createdAt_idx" ON "activities"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "activities_projectId_field_createdAt_idx" ON "activities"("projectId", "field", "createdAt");

-- CreateIndex
CREATE INDEX "views_workspaceId_projectId_idx" ON "views"("workspaceId", "projectId");

-- CreateIndex
CREATE INDEX "views_ownerId_idx" ON "views"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "view_preferences_userId_scope_key" ON "view_preferences"("userId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_entityType_entityId_key" ON "favorites"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "recent_visits_userId_visitedAt_idx" ON "recent_visits"("userId", "visitedAt");

-- CreateIndex
CREATE UNIQUE INDEX "recent_visits_userId_entityType_entityId_key" ON "recent_visits"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "contacts_emailNormalized_idx" ON "contacts" USING GIN ("emailNormalized" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "contacts_workspaceId_emailNormalized_key" ON "contacts"("workspaceId", "emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "contact_access_tokens_tokenHash_key" ON "contact_access_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "contact_access_tokens_contactId_idx" ON "contact_access_tokens"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "intake_forms_slug_key" ON "intake_forms"("slug");

-- CreateIndex
CREATE INDEX "intake_forms_projectId_idx" ON "intake_forms"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "intake_form_fields_formId_key_key" ON "intake_form_fields"("formId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "intake_items_workItemId_key" ON "intake_items"("workItemId");

-- CreateIndex
CREATE INDEX "intake_items_projectId_status_createdAt_idx" ON "intake_items"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "intake_items_contactId_idx" ON "intake_items"("contactId");

-- CreateIndex
CREATE INDEX "intake_items_submitterUserId_idx" ON "intake_items"("submitterUserId");

-- CreateIndex
CREATE UNIQUE INDEX "intake_items_projectId_number_key" ON "intake_items"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "intake_submissions_intakeItemId_key" ON "intake_submissions"("intakeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "intake_submissions_clientSubmissionId_key" ON "intake_submissions"("clientSubmissionId");

-- CreateIndex
CREATE INDEX "intake_submissions_formId_createdAt_idx" ON "intake_submissions"("formId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_recipientId_archivedAt_createdAt_idx" ON "notifications"("recipientId", "archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_recipientId_readAt_idx" ON "notifications"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_recipientId_groupKey_idx" ON "notifications"("recipientId", "groupKey");

-- CreateIndex
CREATE INDEX "notifications_workItemId_idx" ON "notifications"("workItemId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_workspaceId_projectId_type_key" ON "notification_preferences"("userId", "workspaceId", "projectId", "type");

-- CreateIndex
CREATE INDEX "outbound_emails_status_createdAt_idx" ON "outbound_emails"("status", "createdAt");

-- CreateIndex
CREATE INDEX "realtime_events_workspaceId_id_idx" ON "realtime_events"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "realtime_events_createdAt_idx" ON "realtime_events"("createdAt");

-- CreateIndex
CREATE INDEX "presences_resourceKey_expiresAt_idx" ON "presences"("resourceKey", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "presences_userId_resourceKey_key" ON "presences"("userId", "resourceKey");

-- CreateIndex
CREATE INDEX "rate_limit_counters_expiresAt_idx" ON "rate_limit_counters"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "channels_projectId_key" ON "channels"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "channels_dmKey_key" ON "channels"("dmKey");

-- CreateIndex
CREATE INDEX "channels_workspaceId_kind_idx" ON "channels"("workspaceId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "channels_workspaceId_slug_key" ON "channels"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "channel_members_userId_workspaceId_idx" ON "channel_members"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_members_channelId_userId_key" ON "channel_members"("channelId", "userId");

-- CreateIndex
CREATE INDEX "messages_channelId_createdAt_idx" ON "messages"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_threadRootId_createdAt_idx" ON "messages"("threadRootId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_bodyText_idx" ON "messages" USING GIN ("bodyText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "thread_followers_userId_idx" ON "thread_followers"("userId");

-- CreateIndex
CREATE INDEX "notes_ownerId_deletedAt_archivedAt_updatedAt_idx" ON "notes"("ownerId", "deletedAt", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "notes_ownerId_nextReviewAt_idx" ON "notes"("ownerId", "nextReviewAt");

-- CreateIndex
CREATE INDEX "notes_workspaceId_visibility_idx" ON "notes"("workspaceId", "visibility");

-- CreateIndex
CREATE INDEX "notes_projectId_idx" ON "notes"("projectId");

-- CreateIndex
CREATE INDEX "notes_workItemId_idx" ON "notes"("workItemId");

-- CreateIndex
CREATE INDEX "notes_contentText_idx" ON "notes" USING GIN ("contentText" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "tags_ownerId_path_key" ON "tags"("ownerId", "path");

-- CreateIndex
CREATE INDEX "note_tags_tagId_idx" ON "note_tags"("tagId");

-- CreateIndex
CREATE INDEX "note_todos_ownerId_checked_dueDate_idx" ON "note_todos"("ownerId", "checked", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "note_todos_noteId_blockId_key" ON "note_todos"("noteId", "blockId");

-- CreateIndex
CREATE UNIQUE INDEX "mailboxes_workspaceId_emailAddress_key" ON "mailboxes"("workspaceId", "emailAddress");

-- CreateIndex
CREATE INDEX "mailbox_members_userId_idx" ON "mailbox_members"("userId");

-- CreateIndex
CREATE INDEX "mailbox_sync_logs_mailboxId_startedAt_idx" ON "mailbox_sync_logs"("mailboxId", "startedAt");

-- CreateIndex
CREATE INDEX "email_threads_mailboxId_status_lastMessageAt_idx" ON "email_threads"("mailboxId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "email_threads_assigneeId_status_idx" ON "email_threads"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "email_threads_workspaceId_lastMessageAt_idx" ON "email_threads"("workspaceId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "email_threads_contactId_idx" ON "email_threads"("contactId");

-- CreateIndex
CREATE INDEX "email_threads_subject_idx" ON "email_threads" USING GIN ("subject" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "email_threads_mailboxId_gmailThreadId_key" ON "email_threads"("mailboxId", "gmailThreadId");

-- CreateIndex
CREATE INDEX "email_thread_labels_labelId_idx" ON "email_thread_labels"("labelId");

-- CreateIndex
CREATE INDEX "email_messages_threadId_sentAt_idx" ON "email_messages"("threadId", "sentAt");

-- CreateIndex
CREATE INDEX "email_messages_rfc822MessageId_idx" ON "email_messages"("rfc822MessageId");

-- CreateIndex
CREATE UNIQUE INDEX "email_messages_mailboxId_gmailMessageId_key" ON "email_messages"("mailboxId", "gmailMessageId");

-- CreateIndex
CREATE INDEX "email_attachments_messageId_idx" ON "email_attachments"("messageId");

-- CreateIndex
CREATE INDEX "email_comments_threadId_createdAt_idx" ON "email_comments"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_profiles_userId_key" ON "agent_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_hosts_workspaceId_name_key" ON "agent_hosts"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "agent_command_rules_workspaceId_kind_idx" ON "agent_command_rules"("workspaceId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_tokenHash_key" ON "api_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "api_tokens_userId_idx" ON "api_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_runTokenHash_key" ON "agent_runs"("runTokenHash");

-- CreateIndex
CREATE INDEX "agent_runs_workItemId_createdAt_idx" ON "agent_runs"("workItemId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_runs_agentUserId_status_idx" ON "agent_runs"("agentUserId", "status");

-- CreateIndex
CREATE INDEX "agent_runs_workspaceId_status_idx" ON "agent_runs"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "agent_runs_workspaceId_createdAt_idx" ON "agent_runs"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_run_steps_runId_seq_key" ON "agent_run_steps"("runId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "agent_approvals_stepId_key" ON "agent_approvals"("stepId");

-- CreateIndex
CREATE INDEX "agent_approvals_workspaceId_status_requestedAt_idx" ON "agent_approvals"("workspaceId", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "agent_approvals_runId_idx" ON "agent_approvals"("runId");

-- CreateIndex
CREATE INDEX "audit_logs_workspaceId_createdAt_idx" ON "audit_logs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "dashboards_workspaceId_projectId_idx" ON "dashboards"("workspaceId", "projectId");

-- CreateIndex
CREATE INDEX "project_daily_stats_workspaceId_date_idx" ON "project_daily_stats"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "outgoing_webhooks_workspaceId_enabled_idx" ON "outgoing_webhooks"("workspaceId", "enabled");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhookId_createdAt_idx" ON "webhook_deliveries"("webhookId", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_notBefore_idx" ON "webhook_deliveries"("status", "notBefore");

-- CreateIndex
CREATE INDEX "webhook_deliveries_coalesceKey_status_idx" ON "webhook_deliveries"("coalesceKey", "status");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_agentPausedById_fkey" FOREIGN KEY ("agentPausedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_states" ADD CONSTRAINT "workflow_states_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_types" ADD CONSTRAINT "work_item_types_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_types" ADD CONSTRAINT "work_item_types_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "labels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "workflow_states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "work_item_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_trustReviewedById_fkey" FOREIGN KEY ("trustReviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_createdByContactId_fkey" FOREIGN KEY ("createdByContactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_assignees" ADD CONSTRAINT "work_item_assignees_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_assignees" ADD CONSTRAINT "work_item_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_assignees" ADD CONSTRAINT "work_item_assignees_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_subscribers" ADD CONSTRAINT "work_item_subscribers_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_subscribers" ADD CONSTRAINT "work_item_subscribers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_relations" ADD CONSTRAINT "work_item_relations_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_relations" ADD CONSTRAINT "work_item_relations_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_relations" ADD CONSTRAINT "work_item_relations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_links" ADD CONSTRAINT "work_item_links_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_links" ADD CONSTRAINT "work_item_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_references" ADD CONSTRAINT "work_item_references_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_references" ADD CONSTRAINT "work_item_references_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_references" ADD CONSTRAINT "work_item_references_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_references" ADD CONSTRAINT "work_item_references_noteTodoId_fkey" FOREIGN KEY ("noteTodoId") REFERENCES "note_todos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_references" ADD CONSTRAINT "work_item_references_emailThreadId_fkey" FOREIGN KEY ("emailThreadId") REFERENCES "email_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_references" ADD CONSTRAINT "work_item_references_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_references" ADD CONSTRAINT "work_item_references_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorContactId_fkey" FOREIGN KEY ("authorContactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_emailCommentId_fkey" FOREIGN KEY ("emailCommentId") REFERENCES "email_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedByContactId_fkey" FOREIGN KEY ("uploadedByContactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_intakeSubmissionId_fkey" FOREIGN KEY ("intakeSubmissionId") REFERENCES "intake_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_emailCommentId_fkey" FOREIGN KEY ("emailCommentId") REFERENCES "email_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "views" ADD CONSTRAINT "views_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "views" ADD CONSTRAINT "views_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "views" ADD CONSTRAINT "views_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recent_visits" ADD CONSTRAINT "recent_visits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_access_tokens" ADD CONSTRAINT "contact_access_tokens_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_access_tokens" ADD CONSTRAINT "contact_access_tokens_intakeItemId_fkey" FOREIGN KEY ("intakeItemId") REFERENCES "intake_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_form_fields" ADD CONSTRAINT "intake_form_fields_formId_fkey" FOREIGN KEY ("formId") REFERENCES "intake_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_formId_fkey" FOREIGN KEY ("formId") REFERENCES "intake_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_submitterUserId_fkey" FOREIGN KEY ("submitterUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_emailThreadId_fkey" FOREIGN KEY ("emailThreadId") REFERENCES "email_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_items" ADD CONSTRAINT "intake_items_triagedById_fkey" FOREIGN KEY ("triagedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_submissions" ADD CONSTRAINT "intake_submissions_formId_fkey" FOREIGN KEY ("formId") REFERENCES "intake_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_submissions" ADD CONSTRAINT "intake_submissions_intakeItemId_fkey" FOREIGN KEY ("intakeItemId") REFERENCES "intake_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_submissions" ADD CONSTRAINT "intake_submissions_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presences" ADD CONSTRAINT "presences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_threadRootId_fkey" FOREIGN KEY ("threadRootId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_followers" ADD CONSTRAINT "thread_followers_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_followers" ADD CONSTRAINT "thread_followers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_todos" ADD CONSTRAINT "note_todos_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_todos" ADD CONSTRAINT "note_todos_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_todos" ADD CONSTRAINT "note_todos_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_intakeProjectId_fkey" FOREIGN KEY ("intakeProjectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_defaultAssigneeId_fkey" FOREIGN KEY ("defaultAssigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_members" ADD CONSTRAINT "mailbox_members_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_members" ADD CONSTRAINT "mailbox_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_sync_logs" ADD CONSTRAINT "mailbox_sync_logs_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_thread_labels" ADD CONSTRAINT "email_thread_labels_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "email_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_thread_labels" ADD CONSTRAINT "email_thread_labels_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "email_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "email_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_comments" ADD CONSTRAINT "email_comments_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "email_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_comments" ADD CONSTRAINT "email_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_hosts" ADD CONSTRAINT "agent_hosts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_hosts" ADD CONSTRAINT "agent_hosts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_command_rules" ADD CONSTRAINT "agent_command_rules_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_command_rules" ADD CONSTRAINT "agent_command_rules_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "agent_hosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_command_rules" ADD CONSTRAINT "agent_command_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_triggerMessageId_fkey" FOREIGN KEY ("triggerMessageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_triggerCommentId_fkey" FOREIGN KEY ("triggerCommentId") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_emailThreadId_fkey" FOREIGN KEY ("emailThreadId") REFERENCES "email_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "agent_hosts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "agent_run_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "agent_hosts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_daily_stats" ADD CONSTRAINT "project_daily_stats_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_webhooks" ADD CONSTRAINT "outgoing_webhooks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_webhooks" ADD CONSTRAINT "outgoing_webhooks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "outgoing_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
