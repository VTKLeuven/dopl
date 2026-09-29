import "server-only";
import { canWorkspace, ForbiddenError } from "@dopl/shared/policy";
import { publicStatus, type PublicStatus } from "@dopl/shared/schemas/intake";
import { formatIdentifier } from "@dopl/shared/schemas/work-item";
import { z } from "zod";
import { NotFoundError } from "../action-result";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { accessibleProjectsWhere } from "./projects";

function assertView(ctx: WorkspaceCtx) {
  if (!canWorkspace(ctx.policyActor, "contact.view")) throw new ForbiddenError();
}

export interface ContactRow {
  id: string;
  name: string | null;
  email: string;
  organization: string | null;
  requests: number;
  lastSeenAt: string | null;
  blocked: boolean;
}

export async function listContacts(ctx: WorkspaceCtx, q = ""): Promise<ContactRow[]> {
  assertView(ctx);
  const term = q.trim();
  const rows = await db.contact.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      ...(term
        ? {
            OR: [
              { emailNormalized: { contains: term.toLowerCase() } },
              { name: { contains: term, mode: "insensitive" } },
              { organization: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastSeenAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 500,
    select: {
      id: true,
      name: true,
      email: true,
      organization: true,
      lastSeenAt: true,
      blockedAt: true,
      _count: { select: { intakeItems: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    organization: c.organization,
    requests: c._count.intakeItems,
    lastSeenAt: c.lastSeenAt?.toISOString() ?? null,
    blocked: Boolean(c.blockedAt),
  }));
}

export interface ContactDetail {
  id: string;
  name: string | null;
  email: string;
  organization: string | null;
  phone: string | null;
  notes: string | null;
  blocked: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  requests: Array<{
    id: string;
    number: number;
    title: string;
    status: PublicStatus;
    project: { identifier: string; name: string; color: string | null };
    /** INFRA-42 once accepted; otherwise the intake queue link is used. */
    identifier: string | null;
    createdAt: string;
  }>;
}

/** A contact and the requests they sent, limited to projects the viewer can see. */
export async function getContact(ctx: WorkspaceCtx, id: string): Promise<ContactDetail> {
  assertView(ctx);
  if (!z.uuid().safeParse(id).success) throw new NotFoundError();
  const c = await db.contact.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    select: {
      id: true,
      name: true,
      email: true,
      organization: true,
      phone: true,
      notes: true,
      blockedAt: true,
      createdAt: true,
      lastSeenAt: true,
      intakeItems: {
        where: { workItem: { deletedAt: null }, project: accessibleProjectsWhere(ctx) },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          number: true,
          status: true,
          createdAt: true,
          project: { select: { identifier: true, name: true, color: true } },
          workItem: { select: { title: true, sequence: true, stateGroup: true } },
        },
      },
    },
  });
  if (!c) throw new NotFoundError();
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    organization: c.organization,
    phone: c.phone,
    notes: c.notes,
    blocked: Boolean(c.blockedAt),
    createdAt: c.createdAt.toISOString(),
    lastSeenAt: c.lastSeenAt?.toISOString() ?? null,
    requests: c.intakeItems.map((r) => ({
      id: r.id,
      number: r.number,
      title: r.workItem.title,
      status: publicStatus(r.status, r.workItem.stateGroup),
      project: r.project,
      identifier:
        r.workItem.sequence != null
          ? formatIdentifier(r.project.identifier, r.workItem.sequence)
          : null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
