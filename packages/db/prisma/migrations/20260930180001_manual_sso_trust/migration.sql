-- Data for SSO sign-in (D-131). Hand-written: Prisma only diffs structure.

-- 1. Providers registered so far were added by an admin, which is what marks a
--    provider as trusted for its domain from now on.
UPDATE "sso_providers" SET "domainVerified" = true WHERE "domainVerified" IS DISTINCT FROM true;

-- 2. Invites now create the user with a verified address. Users created by an
--    invite before this change get the same, so their first Google or SSO
--    sign-in can link to the account.
UPDATE "users" u SET "emailVerified" = true
WHERE u."kind" = 'HUMAN'
  AND u."emailVerified" = false
  AND EXISTS (SELECT 1 FROM "workspace_invites" wi WHERE lower(wi."email") = lower(u."email"));
