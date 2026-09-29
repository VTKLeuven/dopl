import { describe, expect, it } from "vitest";
import { db } from "../db";
import { buildPublicRequestView, getMyRequest } from "../queries/intake";
import { getWorkItemDetail } from "../queries/work-items";
import {
  addToProject,
  makeMember,
  makeProject,
  makePublishedForm,
  makeWorkspace,
} from "../testing/fixtures";
import { createComment } from "./comments";
import {
  acceptIntake,
  declineIntake,
  markDuplicate,
  replyToRequest,
  snoozeIntake,
  submitRequest,
} from "./intake";
import {
  postStatusReply,
  resolveStatusToken,
  submitPublicForm,
  uploadPublicFile,
} from "./public-intake";
import { createWorkItem, updateWorkItem } from "./work-items";

const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
let ipCounter = 0;
const meta = (ip = `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`) => ({
  ip,
  userAgent: "vitest",
});
const submission = (email: string, values: Record<string, unknown>, extra = {}) => ({
  clientSubmissionId: crypto.randomUUID(),
  email,
  name: "Sam Submitter",
  values,
  startedAt: Date.now() - 10_000,
  ...extra,
});

async function setup() {
  const ws = await makeWorkspace();
  const admin = await makeMember(ws, "ADMIN", "Ann Admin");
  const member = await makeMember(ws, "MEMBER", "Bram Member");
  const project = await makeProject(admin);
  const form = await makePublishedForm(admin, project.id);
  return { ws, admin, member, project, form };
}

async function submit(slug: string, email = `sam-${crypto.randomUUID()}@example.test`) {
  const res = await submitPublicForm(
    slug,
    submission(email, { summary: "Printer on floor 2 is jammed", details: "Line one\nLine two" }),
    meta(),
  );
  if (!res.ok || res.data.number === null) throw new Error(JSON.stringify(res));
  return db.intakeItem.findUniqueOrThrow({
    where: {
      projectId_number: { projectId: (await formProject(slug)).projectId, number: res.data.number },
    },
    include: { workItem: true, contact: true, submission: true },
  });
}
const formProject = (slug: string) =>
  db.intakeForm.findUniqueOrThrow({ where: { slug }, select: { projectId: true } });

describe("public intake forms", () => {
  it("creates an untrusted triage item, a contact, a confirmation email and a notification", async () => {
    const { admin, project, form } = await setup();
    const intake = await submit(form.slug, "Sam@Example.test");
    expect(intake.status).toBe("PENDING");
    expect(intake.workItem.sequence).toBeNull();
    expect(intake.workItem.stateGroup).toBe("TRIAGE");
    expect(intake.workItem.untrusted).toBe(true);
    expect(intake.workItem.origin).toBe("INTAKE_FORM");
    expect(intake.workItem.title).toBe("Printer on floor 2 is jammed");
    expect(intake.workItem.descriptionText).toBe("Line one\nLine two");
    expect(intake.contact?.emailNormalized).toBe("sam@example.test");
    expect(
      await db.outboundEmail.count({
        where: { contactId: intake.contactId, templateKey: "intake.confirmation" },
      }),
    ).toBe(1);
    expect(
      await db.notification.count({
        where: { recipientId: admin.actor.userId, type: "INTAKE_SUBMITTED", entityId: intake.id },
      }),
    ).toBe(1);
    expect(
      await db.realtimeEvent.count({
        where: { topic: `project:${project.id}`, type: "intake.created" },
      }),
    ).toBe(1);
    // Regular lists never include triage items.
    const listed = await db.workItem.count({
      where: { projectId: project.id, stateGroup: { in: ["BACKLOG", "UNSTARTED", "STARTED"] } },
    });
    expect(listed).toBe(0);
  });

  it("is idempotent per client submission id", async () => {
    const { form } = await setup();
    const body = submission("twice@example.test", { summary: "Once" });
    const a = await submitPublicForm(form.slug, body, meta());
    const b = await submitPublicForm(form.slug, body, meta());
    expect(a).toEqual(b);
    expect(await db.intakeSubmission.count({ where: { formId: form.id } })).toBe(1);
  });

  it("drops honeypot and too-fast submissions without storing anything", async () => {
    const { form } = await setup();
    const bot = await submitPublicForm(
      form.slug,
      submission("bot@example.test", { summary: "Buy now" }, { website: "http://spam.test" }),
      meta(),
    );
    const fast = await submitPublicForm(
      form.slug,
      submission("fast@example.test", { summary: "Hi" }, { startedAt: Date.now() }),
      meta(),
    );
    expect(bot).toEqual({ ok: true, data: { number: null } });
    expect(fast).toEqual({ ok: true, data: { number: null } });
    expect(await db.intakeSubmission.count({ where: { formId: form.id } })).toBe(0);
  });

  it("refuses the 21st submission from one IP within 10 minutes", async () => {
    const { form } = await setup();
    const ip = `192.0.2.${Math.floor(Math.random() * 250)}-${crypto.randomUUID()}`;
    const results = [];
    for (let i = 0; i < 21; i++)
      results.push(
        await submitPublicForm(
          form.slug,
          submission(`p${i}-${crypto.randomUUID()}@example.test`, { summary: `n${i}` }),
          meta(ip),
        ),
      );
    expect(results.slice(0, 20).every((r) => r.ok)).toBe(true);
    const last = results[20]!;
    expect(last.ok).toBe(false);
    if (!last.ok) {
      expect(last.status).toBe(429);
      expect(last.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it("validates answers against the form and blocks embeds from other origins", async () => {
    const { admin, project } = await setup();
    const form = await makePublishedForm(admin, project.id, (f) => ({
      settings: { ...f.settings, allowedEmbedOrigins: ["https://vtk.be"] },
    }));
    const missing = await submitPublicForm(form.slug, submission("a@example.test", {}), meta());
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.fields).toHaveProperty("summary");
    const foreign = await submitPublicForm(
      form.slug,
      submission("a@example.test", { summary: "x" }, { embedOrigin: "https://evil.test" }),
      meta(),
    );
    expect(foreign.ok || foreign.status).toBe(403);
    const allowed = await submitPublicForm(
      form.slug,
      submission("a@example.test", { summary: "x" }, { embedOrigin: "https://vtk.be" }),
      meta(),
    );
    expect(allowed.ok).toBe(true);
  });

  it("rejects attachments over the size limit and attaches the rest on submit", async () => {
    const { admin, project } = await setup();
    const form = await makePublishedForm(admin, project.id, (f) => ({
      settings: { ...f.settings, maxFileSizeMb: 1 },
    }));
    const clientSubmissionId = crypto.randomUUID();
    const big = new File([new Uint8Array(1024 * 1024 + 1)], "big.png", { type: "image/png" });
    const tooBig = await uploadPublicFile(form.slug, { clientSubmissionId, file: big }, meta());
    expect(tooBig.ok || tooBig.status).toBe(413);
    const exe = new File(["MZ"], "run.exe", { type: "application/x-msdownload" });
    const badType = await uploadPublicFile(form.slug, { clientSubmissionId, file: exe }, meta());
    expect(badType.ok || badType.status).toBe(415);

    const png = new File([new Uint8Array(10)], "screen shot.png", { type: "image/png" });
    const ok = await uploadPublicFile(form.slug, { clientSubmissionId, file: png }, meta());
    if (!ok.ok) throw new Error("upload failed");
    const res = await submitPublicForm(
      form.slug,
      {
        ...submission("files@example.test", { summary: "With a file", attachments: [ok.data.id] }),
        clientSubmissionId,
      },
      meta(),
    );
    expect(res.ok).toBe(true);
    const a = await db.attachment.findUniqueOrThrow({ where: { id: ok.data.id } });
    expect(a.status).toBe("READY");
    expect(a.workItemId).not.toBeNull();

    // Someone else's quarantined upload can't be claimed by another submission.
    const other = await uploadPublicFile(
      form.slug,
      { clientSubmissionId: crypto.randomUUID(), file: png },
      meta(),
    );
    if (!other.ok) throw new Error("upload failed");
    await submitPublicForm(
      form.slug,
      submission("thief@example.test", { summary: "x", attachments: [other.data.id] }),
      meta(),
    );
    expect((await db.attachment.findUniqueOrThrow({ where: { id: other.data.id } })).status).toBe(
      "QUARANTINED",
    );
  });
});

describe("triage", () => {
  it("accepting assigns the next number; declining never uses one", async () => {
    const { admin, member, project, form } = await setup();
    const first = await submit(form.slug);
    const second = await submit(form.slug);
    await declineIntake(admin, { id: first.id, reason: "Out of scope" });
    const before = await db.project.findUniqueOrThrow({ where: { id: project.id } });
    const accepted = await acceptIntake(admin, {
      id: second.id,
      stateId: project.byName("Todo").id,
      assigneeIds: [member.actor.userId],
    });
    expect(accepted.identifier).toBe(`${project.identifier}-${before.nextSequence}`);
    const item = await db.workItem.findUniqueOrThrow({
      where: { id: second.workItemId },
      include: { assignees: true },
    });
    expect(item.stateGroup).toBe("UNSTARTED");
    expect(item.assignees.map((a) => a.userId)).toEqual([member.actor.userId]);
    const declined = await db.workItem.findUniqueOrThrow({ where: { id: first.workItemId } });
    expect(declined.sequence).toBeNull();
    expect(
      await db.outboundEmail.findMany({
        where: { contactId: { in: [first.contactId!, second.contactId!] } },
        select: { templateKey: true },
        orderBy: { createdAt: "asc" },
      }),
    ).toEqual(
      expect.arrayContaining([
        { templateKey: "intake.declined" },
        { templateKey: "intake.accepted" },
      ]),
    );
    await expect(acceptIntake(admin, { id: second.id })).rejects.toThrow("already_triaged");
  });

  it("keeps requests in triage until accepted and supports snooze and duplicates", async () => {
    const { admin, project, form } = await setup();
    const intake = await submit(form.slug);
    await expect(
      updateWorkItem(admin, { id: intake.workItemId, stateId: project.byName("Todo").id }),
    ).rejects.toThrow("in_triage");
    // Triagers can still tidy the title before accepting.
    await updateWorkItem(admin, { id: intake.workItemId, title: "Printer jam (floor 2)" });

    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await snoozeIntake(admin, { id: intake.id, until });
    expect(
      (await db.intakeItem.findUniqueOrThrow({ where: { id: intake.id } })).snoozedUntil,
    ).not.toBeNull();

    const original = await createWorkItem(admin, { projectId: project.id, title: "Printers" });
    const res = await markDuplicate(admin, { id: intake.id, duplicateOfId: original.id });
    expect(res.duplicateOf).toBe(original.identifier);
    const after = await db.intakeItem.findUniqueOrThrow({ where: { id: intake.id } });
    expect(after.status).toBe("DUPLICATE");
    expect(after.snoozedUntil).toBeNull();
  });

  it("guests can't triage", async () => {
    const { ws, project, form } = await setup();
    const guest = await makeMember(ws, "GUEST", "Gus Guest");
    await addToProject(project.id, guest, "GUEST");
    const intake = await submit(form.slug);
    await expect(acceptIntake(guest, { id: intake.id })).rejects.toThrow();
  });
});

describe("status page and replies", () => {
  it("shows public comments only, and a contact's reply becomes a PUBLIC comment", async () => {
    const { admin, form } = await setup();
    const intake = await submit(form.slug);
    await createComment(admin, {
      workItemId: intake.workItemId,
      body: doc("Internal: check toner"),
    });
    await createComment(admin, {
      workItemId: intake.workItemId,
      body: doc("We'll swap the drum today"),
      visibility: "PUBLIC",
    });
    // The public reply emailed the contact with a fresh status link.
    const replyMail = await db.outboundEmail.findFirstOrThrow({
      where: { contactId: intake.contactId, templateKey: "intake.reply" },
    });
    const url = (replyMail.payload as { statusUrl: string }).statusUrl;
    const token = url.split("/s/")[1]!;
    const access = await resolveStatusToken(token);
    expect(access?.intakeItemId).toBe(intake.id);

    const view = await buildPublicRequestView(intake.id, { contactId: intake.contactId! });
    expect(view.status).toBe("received");
    expect(view.comments.map((c) => c.body)).toEqual([doc("We'll swap the drum today")]);
    expect(JSON.stringify(view)).not.toContain("Internal: check toner");

    const reply = await postStatusReply(token, { body: "Thanks!\nIt's room 2.14" }, meta());
    expect(reply.ok).toBe(true);
    const comment = await db.comment.findFirstOrThrow({
      where: { workItemId: intake.workItemId, authorContactId: intake.contactId },
    });
    expect(comment.visibility).toBe("PUBLIC");
    expect(comment.bodyText).toBe("Thanks!\nIt's room 2.14");
    expect(
      await db.notification.count({
        where: { recipientId: admin.actor.userId, type: "INTAKE_REPLY" },
      }),
    ).toBe(1);

    expect(await resolveStatusToken("not-a-real-token-at-all-000000")).toBeNull();
  });

  it("guests follow their own requests; internal notes never reach them", async () => {
    const { ws, admin, project } = await setup();
    const guest = await makeMember(ws, "GUEST", "Gus Guest");
    await addToProject(project.id, guest, "GUEST");
    const req = await submitRequest(guest, { projectId: project.id, title: "Need a VPN account" });
    const intake = await db.intakeItem.findUniqueOrThrow({ where: { id: req.id } });
    expect(intake.source).toBe("IN_APP");

    await createComment(admin, { workItemId: intake.workItemId, body: doc("Internal note") });
    await createComment(admin, {
      workItemId: intake.workItemId,
      body: doc("Which department?"),
      visibility: "PUBLIC",
    });
    const view = await getMyRequest(guest, req.id);
    expect(view.comments).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain("Internal note");
    const notes = await db.notification.findMany({ where: { recipientId: guest.actor.userId } });
    expect(notes.map((n) => n.type)).toEqual(["COMMENT"]);

    await replyToRequest(guest, { id: req.id, body: doc("Finance") });
    expect((await getMyRequest(guest, req.id)).comments).toHaveLength(2);

    // Another guest can't read it, and guests can't open triage items by id.
    const other = await makeMember(ws, "GUEST", "Olga Other");
    await addToProject(project.id, other, "GUEST");
    await expect(getMyRequest(other, req.id)).rejects.toThrow();
    await expect(getWorkItemDetail(guest, intake.workItemId)).rejects.toThrow();
    // Members who triage can.
    const detail = await getWorkItemDetail(admin, intake.workItemId);
    expect(detail.identifier).toBe(`Intake #${intake.number}`);
    expect(detail.request?.submitter?.kind).toBe("user");
  });
});
