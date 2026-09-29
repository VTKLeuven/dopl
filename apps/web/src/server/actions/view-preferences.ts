"use server";

import type { Prisma } from "@dopl/db";
import { DisplayOptionsSchema } from "@dopl/shared/schemas/view";
import { FilterGroupSchema, normalizeFilter } from "@dopl/shared/schemas/filters";
import { z } from "zod";
import { run } from "../action-result";
import { db } from "../db";
import { requireWorkspaceCtx } from "../session";

const ScopeSchema = z
  .string()
  .regex(/^(project|view|workspace|my-work):[a-z0-9-]*$/i)
  .max(80);

/** Remembers a user's display options and filters per scope (unsaved views). */
export async function saveViewPreferenceAction(
  ws: string,
  scope: string,
  displayOptions: unknown,
  filters?: unknown,
) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(async () => {
    const s = ScopeSchema.parse(scope);
    const opts = DisplayOptionsSchema.parse(displayOptions);
    const f =
      filters === undefined
        ? undefined
        : (normalizeFilter(FilterGroupSchema.parse(filters)) as unknown as Prisma.InputJsonValue);
    await db.viewPreference.upsert({
      where: { userId_scope: { userId: ctx.actor.userId, scope: s } },
      create: {
        userId: ctx.actor.userId,
        workspaceId: ctx.workspace.id,
        scope: s,
        layout: opts.layout,
        displayOptions: opts as unknown as Prisma.InputJsonValue,
        ...(f ? { filters: f } : {}),
      },
      update: {
        layout: opts.layout,
        displayOptions: opts as unknown as Prisma.InputJsonValue,
        ...(f ? { filters: f } : {}),
      },
    });
    return null;
  });
}
