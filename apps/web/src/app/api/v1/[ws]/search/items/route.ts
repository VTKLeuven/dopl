import { formatIdentifier, parseIdentifier } from "@dopl/shared/schemas/work-item";
import { api } from "@/server/api";
import { db } from "@/server/db";
import { accessibleProjectsWhere } from "@/server/queries/projects";

/** Quick item search for #refs, parent/relation pickers and ⌘K (trigram + identifier). */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/[ws]/search/items">) {
  const { ws } = await params;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const projectId = url.searchParams.get("projectId");
  return api(ws, async (ctx) => {
    const ident = parseIdentifier(q);
    const seqOnly = /^\d{1,9}$/.test(q) ? Number(q) : null;
    const rows = await db.workItem.findMany({
      where: {
        workspaceId: ctx.workspace.id,
        deletedAt: null,
        sequence: { not: null },
        project: { ...accessibleProjectsWhere(ctx), ...(projectId ? { id: projectId } : {}) },
        ...(ident
          ? {
              sequence: ident.sequence,
              project: { ...accessibleProjectsWhere(ctx), identifier: ident.identifier },
            }
          : seqOnly
            ? { OR: [{ sequence: seqOnly }, { title: { contains: q, mode: "insensitive" } }] }
            : q
              ? { title: { contains: q, mode: "insensitive" } }
              : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: {
        id: true,
        sequence: true,
        title: true,
        stateGroup: true,
        project: { select: { identifier: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      identifier: formatIdentifier(r.project.identifier, r.sequence),
      title: r.title,
      stateGroup: r.stateGroup,
    }));
  });
}
