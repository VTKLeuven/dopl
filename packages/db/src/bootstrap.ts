/**
 * First-run setup: creates the workspace and its first Owner, then prints a
 * one-time invite link (accounts are invite-only, D-050).
 *
 *   pnpm dopl:bootstrap --email you@vtk.be --name "Your Name" [--workspace "VTK IT"] [--slug vtk]
 */
import path from "node:path";
import { parseArgs } from "node:util";
import { config as loadEnv } from "dotenv";
import { generateToken, hashToken } from "@dopl/shared/crypto";
import { keysBetween } from "@dopl/shared/sort-keys";
import { defaultWorkItemTypes, INVITE_TTL_MS } from "@dopl/shared/defaults";
import { createDbClient } from "./client";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    workspace: { type: "string", default: "VTK IT" },
    slug: { type: "string", default: "vtk" },
  },
});

if (!values.email || !values.name) {
  console.error('Usage: pnpm dopl:bootstrap --email you@vtk.be --name "Your Name" [--workspace "VTK IT"] [--slug vtk]');
  process.exit(1);
}
const email = values.email.trim().toLowerCase();
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

const db = createDbClient({
  connectionString: process.env.DATABASE_URL ?? "",
  applicationName: "dopl-bootstrap",
  maxConnections: 1,
});

try {
  const token = generateToken();
  const result = await db.$transaction(async (tx) => {
    const workspace =
      (await tx.workspace.findUnique({ where: { slug: values.slug } })) ??
      (await tx.workspace.create({ data: { slug: values.slug, name: values.workspace } }));

    const typeCount = await tx.workItemType.count({ where: { workspaceId: workspace.id } });
    if (typeCount === 0) {
      const keys = keysBetween(null, null, defaultWorkItemTypes.length);
      await tx.workItemType.createMany({
        data: defaultWorkItemTypes.map((t, i) => ({
          workspaceId: workspace.id,
          name: t.name,
          icon: t.icon,
          color: t.color,
          isDefault: t.isDefault ?? false,
          sortKey: keys[i] ?? "a0",
        })),
      });
    }

    const user =
      (await tx.user.findUnique({ where: { email } })) ??
      (await tx.user.create({ data: { email, name: values.name ?? email } }));

    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      create: { workspaceId: workspace.id, userId: user.id, role: "OWNER", status: "INVITED" },
      update: { role: "OWNER" },
    });
    await tx.workspaceInvite.create({
      data: {
        workspaceId: workspace.id,
        email,
        role: "OWNER",
        projectIds: [],
        tokenHash: hashToken(token),
        invitedById: user.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "SYSTEM",
        actorLabel: "dopl:bootstrap",
        action: "workspace.bootstrapped",
        targetType: "User",
        targetId: user.id,
        metadata: { email },
      },
    });
    return { workspace };
  });

  console.log(`\nWorkspace "${result.workspace.name}" (/${result.workspace.slug}) is ready.`);
  console.log(`Owner invite for ${email} (valid 7 days):\n\n  ${appUrl}/invite/${token}\n`);
} finally {
  await db.$disconnect();
}
