import "server-only";
import { Prisma } from "@dopl/db";
import { textToDoc } from "@dopl/shared/rich-text";
import { ForbiddenError } from "@dopl/shared/policy";
import {
  CreateFormSchema,
  defaultFormFields,
  FormSettingsSchema,
  FormThemeSchema,
  SaveFormSchema,
  type SaveFormInput,
} from "@dopl/shared/schemas/intake";
import { keysBetween } from "@dopl/shared/sort-keys";
import { z } from "zod";
import { ConflictError, NotFoundError } from "../action-result";
import { db } from "../db";
import { audit, withMutation, type Mutation } from "../mutation";
import { projectAccessById } from "../queries/projects";
import type { WorkspaceCtx } from "../session";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

async function loadForManage(m: Mutation, id: string) {
  const form = await m.tx.intakeForm.findFirst({
    where: { id, workspaceId: m.ctx.workspace.id, deletedAt: null },
    select: { id: true, slug: true, projectId: true, isPublished: true, title: true },
  });
  if (!form) throw new NotFoundError();
  const access = await projectAccessById(m.ctx, form.projectId);
  if (!access.can("project.manage")) throw new ForbiddenError();
  return { form, access };
}

/** New forms start unpublished with a summary / details / files layout. */
export async function createForm(ctx: WorkspaceCtx, raw: unknown) {
  const input = CreateFormSchema.parse(raw);
  const access = await projectAccessById(ctx, input.projectId);
  if (!access.can("project.manage")) throw new ForbiddenError();
  return withMutation(ctx, async (m) => {
    const base = slugify(`${access.project.identifier}-${input.title}`) || "form";
    let slug = base;
    for (
      let i = 2;
      await m.tx.intakeForm.findUnique({ where: { slug }, select: { id: true } });
      i++
    )
      slug = `${base}-${i}`;
    const fields = defaultFormFields();
    const keys = keysBetween(null, null, fields.length);
    const form = await m.tx.intakeForm.create({
      data: {
        workspaceId: ctx.workspace.id,
        projectId: access.project.id,
        slug,
        title: input.title,
        settings: FormSettingsSchema.parse({}) as Prisma.InputJsonValue,
        theme: FormThemeSchema.parse({}) as Prisma.InputJsonValue,
        createdById: ctx.actor.userId,
        fields: {
          createMany: {
            data: fields.map((f, i) => ({
              key: f.key,
              label: f.label,
              type: f.type,
              required: f.required,
              helpText: f.helpText ?? null,
              placeholder: f.placeholder ?? null,
              options: f.options,
              target: f.target,
              sortKey: keys[i] ?? `a${i}`,
            })),
          },
        },
      },
      select: { id: true, slug: true },
    });
    m.activity({
      entityType: "INTAKE_FORM",
      entityId: form.id,
      projectId: access.project.id,
      verb: "created",
      meta: { title: input.title },
    });
    m.emit({
      topic: `project:${access.project.id}`,
      type: "intakeForm.created",
      payload: { id: form.id },
    });
    return form;
  });
}

/**
 * Saves the whole form definition at once. Fields are matched by key: removed
 * ones are archived (old submissions still reference them), re-added ones come
 * back. Returns the slugs whose cached public page must be refreshed.
 */
export async function saveForm(ctx: WorkspaceCtx, raw: SaveFormInput) {
  const input = SaveFormSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const { tx } = m;
    const { form, access } = await loadForManage(m, input.id);
    if (input.slug !== form.slug) {
      const taken = await tx.intakeForm.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (taken) throw new ConflictError("slug_taken");
    }
    const s = input.settings;
    const [people, labels, type] = await Promise.all([
      tx.workspaceMember.count({
        where: {
          workspaceId: ctx.workspace.id,
          userId: { in: s.notifyUserIds },
          status: "ACTIVE",
          role: { not: "GUEST" },
        },
      }),
      tx.label.count({
        where: {
          id: { in: s.defaults.labelIds },
          workspaceId: ctx.workspace.id,
          OR: [{ projectId: access.project.id }, { projectId: null }],
        },
      }),
      s.defaults.typeId
        ? tx.workItemType.count({ where: { id: s.defaults.typeId, workspaceId: ctx.workspace.id } })
        : Promise.resolve(1),
    ]);
    if (people !== new Set(s.notifyUserIds).size) throw new ConflictError("invalid_notify");
    if (labels !== new Set(s.defaults.labelIds).size || type !== 1)
      throw new ConflictError("invalid_defaults");

    await tx.intakeForm.update({
      where: { id: form.id },
      data: {
        title: input.title,
        description: input.description
          ? (textToDoc(input.description) as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        slug: input.slug,
        settings: s as unknown as Prisma.InputJsonValue,
        theme: input.theme as Prisma.InputJsonValue,
      },
    });
    const existing = await tx.intakeFormField.findMany({
      where: { formId: form.id },
      select: { id: true, key: true },
    });
    const byKey = new Map(existing.map((f) => [f.key, f.id]));
    const keys = keysBetween(null, null, input.fields.length);
    for (const [i, f] of input.fields.entries()) {
      const data = {
        label: f.label,
        type: f.type,
        required: f.required,
        helpText: f.helpText ?? null,
        placeholder: f.placeholder ?? null,
        options: f.options as Prisma.InputJsonValue,
        target: f.target,
        sortKey: keys[i] ?? `a${i}`,
        archivedAt: null,
      };
      const id = byKey.get(f.key);
      if (id) await tx.intakeFormField.update({ where: { id }, data });
      else await tx.intakeFormField.create({ data: { ...data, formId: form.id, key: f.key } });
    }
    const kept = new Set(input.fields.map((f) => f.key));
    await tx.intakeFormField.updateMany({
      where: { formId: form.id, key: { notIn: [...kept] }, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    m.activity({
      entityType: "INTAKE_FORM",
      entityId: form.id,
      projectId: access.project.id,
      verb: "updated",
      meta: { title: input.title },
    });
    m.emit({
      topic: `project:${access.project.id}`,
      type: "intakeForm.updated",
      payload: { id: form.id },
    });
    return { id: form.id, slugs: [...new Set([form.slug, input.slug])] };
  });
}

/** Publishing puts the form on the public internet (D-051), so it's audited. */
export async function setFormPublished(ctx: WorkspaceCtx, id: string, published: boolean) {
  return withMutation(ctx, async (m) => {
    const { form, access } = await loadForManage(m, z.uuid().parse(id));
    await m.tx.intakeForm.update({ where: { id: form.id }, data: { isPublished: published } });
    await audit(m.tx, ctx, {
      action: published ? "intake_form.published" : "intake_form.unpublished",
      targetType: "intake_form",
      targetId: form.id,
      metadata: { slug: form.slug, project: access.project.identifier },
    });
    m.activity({
      entityType: "INTAKE_FORM",
      entityId: form.id,
      projectId: access.project.id,
      verb: published ? "published" : "unpublished",
    });
    m.emit({
      topic: `project:${access.project.id}`,
      type: "intakeForm.updated",
      payload: { id: form.id },
    });
    return { id: form.id, slugs: [form.slug] };
  });
}

/** Soft delete: submissions keep pointing at the form. */
export async function deleteForm(ctx: WorkspaceCtx, id: string) {
  return withMutation(ctx, async (m) => {
    const { form, access } = await loadForManage(m, z.uuid().parse(id));
    await m.tx.intakeForm.update({
      where: { id: form.id },
      data: { deletedAt: new Date(), isPublished: false },
    });
    await audit(m.tx, ctx, {
      action: "intake_form.deleted",
      targetType: "intake_form",
      targetId: form.id,
      metadata: { slug: form.slug },
    });
    m.activity({
      entityType: "INTAKE_FORM",
      entityId: form.id,
      projectId: access.project.id,
      verb: "deleted",
    });
    m.emit({
      topic: `project:${access.project.id}`,
      type: "intakeForm.deleted",
      payload: { id: form.id },
    });
    return { id: form.id, slugs: [form.slug] };
  });
}

/** Turns intake on or off for a project (off: forms stop accepting, the queue stays). */
export async function setIntakeEnabled(ctx: WorkspaceCtx, projectId: string, enabled: boolean) {
  const access = await projectAccessById(ctx, z.uuid().parse(projectId));
  if (!access.can("project.manage")) throw new ForbiddenError();
  const slugs = (
    await db.intakeForm.findMany({
      where: { projectId: access.project.id },
      select: { slug: true },
    })
  ).map((f) => f.slug);
  return withMutation(ctx, async (m) => {
    await m.tx.project.update({
      where: { id: access.project.id },
      data: { intakeEnabled: enabled },
    });
    m.activity({
      entityType: "PROJECT",
      entityId: access.project.id,
      projectId: access.project.id,
      verb: "updated",
      field: "intakeEnabled",
      toValue: enabled,
    });
    m.emit({
      topic: `project:${access.project.id}`,
      type: "project.updated",
      payload: { id: access.project.id },
    });
    return { slugs };
  });
}
