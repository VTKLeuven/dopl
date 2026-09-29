-- Hand-written SQL that Prisma's schema language cannot express (D-015).
-- Verified drift-free with Prisma 7.10: Prisma ignores column collation,
-- CHECK constraints and triggers when diffing, and never looks at the
-- `search` schema.

-- 1. Fractional-index sort keys must compare in byte order (D-014).
ALTER TABLE "project_members"    ALTER COLUMN "sortKey" TYPE text COLLATE "C";
ALTER TABLE "workflow_states"    ALTER COLUMN "sortKey" TYPE text COLLATE "C";
ALTER TABLE "work_item_types"    ALTER COLUMN "sortKey" TYPE text COLLATE "C";
ALTER TABLE "labels"             ALTER COLUMN "sortKey" TYPE text COLLATE "C";
ALTER TABLE "work_items"         ALTER COLUMN "sortKey" TYPE text COLLATE "C";
ALTER TABLE "views"              ALTER COLUMN "sortKey" TYPE text COLLATE "C";
ALTER TABLE "favorites"          ALTER COLUMN "sortKey" TYPE text COLLATE "C";
ALTER TABLE "intake_form_fields" ALTER COLUMN "sortKey" TYPE text COLLATE "C";
ALTER TABLE "dashboards"         ALTER COLUMN "sortKey" TYPE text COLLATE "C";

-- 2. Exactly-one-target / at-most-one-owner rules.
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_exactly_one_target"
  CHECK (num_nonnulls("commentId", "messageId", "emailCommentId") = 1);
ALTER TABLE "work_item_references" ADD CONSTRAINT "work_item_references_exactly_one_source"
  CHECK (num_nonnulls("messageId", "noteId", "emailThreadId", "commentId") = 1);
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_at_most_one_owner"
  CHECK (num_nonnulls("workItemId", "commentId", "messageId", "noteId", "intakeSubmissionId", "emailCommentId") <= 1);
ALTER TABLE "work_item_relations" ADD CONSTRAINT "work_item_relations_no_self"
  CHECK ("sourceId" <> "targetId");
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_sequence_iff_not_triage"
  CHECK (("sequence" IS NULL) = ("stateGroup" = 'TRIAGE'));

-- 3. audit_logs is append-only.
CREATE OR REPLACE FUNCTION dopl_audit_logs_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END
$$;
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION dopl_audit_logs_immutable();

-- 4. Semantic search vectors live outside Prisma's schema (D-017).
CREATE SCHEMA IF NOT EXISTS search;
CREATE TABLE IF NOT EXISTS search.embeddings (
  "id"          uuid PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "entityType"  text NOT NULL,
  "entityId"    uuid NOT NULL,
  "chunkIndex"  integer NOT NULL DEFAULT 0,
  "contentHash" text NOT NULL,
  "model"       text NOT NULL,
  "embedding"   public.vector(1024) NOT NULL,
  "ownerId"     uuid,
  "projectId"   uuid,
  "createdAt"   timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT "embeddings_entity_chunk_model_key" UNIQUE ("entityType", "entityId", "chunkIndex", "model")
);
CREATE INDEX IF NOT EXISTS "embeddings_hnsw" ON search.embeddings USING hnsw ("embedding" public.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "embeddings_scope" ON search.embeddings ("workspaceId", "entityType");
