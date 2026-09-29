/**
 * Notes seed (Phase 5): Bram's notes with nested #tags, to-dos (some with
 * due dates), colours, a pin and an archived note; older notes that are due
 * for the daily review; a note Chloé shares with the team and one Dries
 * attached to INFRA. Fixed texts, dates relative to today. The tag and to-do
 * projections are built with the same shared helpers the notes service uses.
 */
import {
  addDaysTo,
  ensureBlockIds,
  expandTagPaths,
  extractTags,
  extractTodos,
  parentPath,
  reviewIntervalDays,
  tagName,
} from "@dopl/shared/domain/notes";
import { docToPlainText, type PMNode } from "@dopl/shared/rich-text";
import { uuidv7 } from "@dopl/shared/ids";
import type { DbClient } from "../client";
import type { Prisma } from "../generated/prisma/client";

const DAY = 24 * 60 * 60 * 1000;

/** Lines → paragraphs; `[ ]`/`[x]` lines → one task list per run of them. */
function note(text: string): PMNode {
  const content: PMNode[] = [];
  let tasks: PMNode[] | null = null;
  for (const line of text.split("\n")) {
    const m = /^\[( |x)\] (.*)$/.exec(line);
    if (m) {
      if (!tasks) content.push({ type: "taskList", content: (tasks = []) });
      tasks.push({
        type: "taskItem",
        attrs: { checked: m[1] === "x" },
        content: [{ type: "paragraph", content: [{ type: "text", text: m[2]! }] }],
      });
      continue;
    }
    tasks = null;
    content.push({ type: "paragraph", content: line ? [{ type: "text", text: line }] : [] });
  }
  return { type: "doc", content };
}

interface NoteSpec {
  owner: string;
  text: string;
  /** Days before today it was written. */
  age: number;
  color?: string;
  pinned?: boolean;
  archived?: boolean;
  visibility?: "WORKSPACE";
  project?: string;
  /** Reviews done so far; notes older than their interval come up in the review. */
  reviews?: number;
  /** Due dates for to-dos, by line text, in days from today. */
  due?: Record<string, number>;
}

const specs: NoteSpec[] = [
  {
    owner: "bram@dopl.test",
    text: "Proxmox 9 upgrade #infra/proxmox\n[x] Snapshot every VM on pve-01\n[ ] Upgrade pve-01 and reboot\n[ ] Upgrade pve-02\n[ ] Check Ceph health after both reboots",
    age: 2,
    color: "amber",
    pinned: true,
    due: { "Upgrade pve-01 and reboot": 0, "Upgrade pve-02": 2 },
  },
  {
    owner: "bram@dopl.test",
    text: "Password manager rollout #security\n[x] Pick a plan with shared vaults\n[ ] Draft the onboarding mail for committee leads\n[ ] Invite the praesidium",
    age: 5,
    due: { "Draft the onboarding mail for committee leads": 1 },
  },
  {
    owner: "bram@dopl.test",
    text: "IT weekly, Monday\nDecided: printers move to their own VLAN, Dries owns it. Website freeze during exams.\n[ ] Ask Dries for the printer VLAN id #network\n[ ] Book the server room for the rack cleanup",
    age: 1,
  },
  {
    owner: "bram@dopl.test",
    text: "Ideas for the new website #web\nEvent calendar as an ICS feed, dark mode, and an image pipeline that stops shipping 6 MB photos.",
    age: 9,
    color: "blue",
    reviews: 1,
  },
  {
    owner: "bram@dopl.test",
    text: "WireGuard peers #network/vpn\nBoard laptops get a peer each; the config lives in the vault, never in chat.",
    age: 24,
    reviews: 2,
  },
  {
    owner: "bram@dopl.test",
    text: "Handy Proxmox commands #infra/proxmox\nqm list · pvecm status · ceph -s · pveversion -v",
    age: 40,
    color: "green",
    reviews: 3,
  },
  {
    owner: "bram@dopl.test",
    text: "Books to read\nSite Reliability Engineering, The Phoenix Project, Designing Data-Intensive Applications.",
    age: 60,
    color: "purple",
  },
  {
    owner: "bram@dopl.test",
    text: "Old DHCP ranges #network\n10.20.0.100–199 before the renumbering. Kept for reference.",
    age: 90,
    archived: true,
  },
  {
    owner: "chloe@dopl.test",
    text: "On-call rota, first semester #oncall\nWeeks 1–4 Chloé, 5–8 Bram, 9–12 Dries. Swap in the chat, then update this note.",
    age: 3,
    visibility: "WORKSPACE",
    color: "pink",
  },
  {
    owner: "dries@dopl.test",
    text: "Rack layout decisions\nSwitches at the top, UPS at the bottom, patch panel under the switches. Label both ends of every cable.",
    age: 6,
    project: "INFRA",
  },
];

export async function seedNotes(db: DbClient, opts: { workspaceId: string; today: Date }) {
  const { workspaceId, today } = opts;
  const now = new Date();
  const owners = new Map(
    (
      await db.user.findMany({
        where: { email: { in: [...new Set(specs.map((s) => s.owner))] } },
        select: { id: true, email: true },
      })
    ).map((u) => [u.email, u.id]),
  );
  const projects = new Map(
    (
      await db.project.findMany({ where: { workspaceId }, select: { id: true, identifier: true } })
    ).map((p) => [p.identifier, p.id]),
  );

  let count = 0;
  for (const spec of specs) {
    const ownerId = owners.get(spec.owner);
    if (!ownerId) continue;
    const doc = ensureBlockIds(note(spec.text));
    const created = new Date(now.getTime() - spec.age * DAY);
    const reviews = spec.reviews ?? 0;
    // Written long enough ago that the next interval has passed: due for review.
    const nextReviewAt = addDaysTo(created, reviewIntervalDays(reviews));
    const todos = extractTodos(doc);
    const noteRow = await db.note.create({
      data: {
        id: uuidv7(),
        workspaceId,
        ownerId,
        content: doc as unknown as Prisma.InputJsonValue,
        contentText: docToPlainText(doc),
        color: spec.color ?? null,
        visibility: spec.visibility ?? "PRIVATE",
        projectId: spec.project ? (projects.get(spec.project) ?? null) : null,
        pinnedAt: spec.pinned ? created : null,
        archivedAt: spec.archived ? created : null,
        hasTodos: todos.length > 0,
        openTodoCount: todos.filter((t) => !t.checked).length,
        reviewCount: reviews,
        lastReviewedAt: reviews > 0 ? created : null,
        nextReviewAt,
        createdAt: created,
        updatedAt: created,
      },
      select: { id: true },
    });

    // Tags: parents exist implicitly (`infra` for `infra/proxmox`).
    const paths = extractTags(doc);
    const ids = new Map<string, string>();
    for (const path of expandTagPaths(paths)) {
      const parent = parentPath(path);
      const tag = await db.tag.upsert({
        where: { ownerId_path: { ownerId, path } },
        create: {
          id: uuidv7(),
          workspaceId,
          ownerId,
          path,
          name: tagName(path),
          parentId: parent ? (ids.get(parent) ?? null) : null,
        },
        update: {},
        select: { id: true },
      });
      ids.set(path, tag.id);
    }
    if (paths.length)
      await db.noteTag.createMany({
        data: paths.map((p) => ({ noteId: noteRow.id, tagId: ids.get(p)! })),
        skipDuplicates: true,
      });

    if (todos.length)
      await db.noteTodo.createMany({
        data: todos.map((t) => {
          const due = spec.due?.[t.text];
          return {
            id: uuidv7(),
            workspaceId,
            noteId: noteRow.id,
            ownerId,
            blockId: t.blockId,
            text: t.text,
            checked: t.checked,
            checkedAt: t.checked ? created : null,
            position: t.position,
            dueDate: due === undefined ? null : new Date(today.getTime() + due * DAY),
          };
        }),
      });
    count++;
  }
  return count;
}
