import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import {
  DEFAULT_MIME_TYPES,
  FieldOptionsSchema,
  FormSettingsSchema,
  type PublicFormDefinition,
} from "@dopl/shared/schemas/intake";
import { docToPlainText, type PMNode } from "@dopl/shared/rich-text";
import { db } from "../db";
import { env, turnstileEnabled } from "../env";

export const publicFormTag = (slug: string) => `intake-form:${slug.toLowerCase()}`;
/** The /feedback page; refreshed whenever any form or project behind it changes. */
export const feedbackPageTag = "feedback-page";

/** Published forms of live projects that still take requests. */
const liveForm = {
  isPublished: true,
  archivedAt: null,
  deletedAt: null,
  project: { deletedAt: null, archivedAt: null, intakeEnabled: true },
} as const;

/**
 * The public form definition, cached (the static shell of /f/<slug>). Saving
 * or publishing a form calls updateTag, so edits show up immediately. The
 * submit endpoint never trusts this cache; it re-reads the form.
 */
export async function getPublicForm(slug: string): Promise<PublicFormDefinition | null> {
  "use cache";
  cacheTag(publicFormTag(slug));
  cacheLife("hours");
  const form = await db.intakeForm.findFirst({
    where: { slug: slug.toLowerCase(), ...liveForm },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      settings: true,
      project: { select: { workspace: { select: { name: true } } } },
      fields: {
        where: { archivedAt: null },
        orderBy: { sortKey: "asc" },
        select: {
          key: true,
          label: true,
          type: true,
          required: true,
          helpText: true,
          placeholder: true,
          options: true,
          target: true,
        },
      },
    },
  });
  if (!form) return null;
  const settings = FormSettingsSchema.catch(FormSettingsSchema.parse({})).parse(form.settings);
  return {
    id: form.id,
    slug: form.slug,
    title: form.title,
    description: docToPlainText(form.description as PMNode | null),
    workspaceName: form.project.workspace.name,
    onFeedbackPage: settings.showOnFeedbackPage,
    successMessage: settings.successMessage,
    turnstileSiteKey:
      settings.turnstileEnabled && turnstileEnabled ? (env.TURNSTILE_SITE_KEY ?? null) : null,
    allowedEmbedOrigins: settings.allowedEmbedOrigins,
    maxFileSizeMb: settings.maxFileSizeMb,
    maxFiles: settings.maxFiles,
    accept: settings.allowedMimeTypes.length ? settings.allowedMimeTypes : DEFAULT_MIME_TYPES,
    fields: form.fields.map((f) => ({
      ...f,
      options: FieldOptionsSchema.catch([]).parse(f.options),
    })),
  };
}

export interface FeedbackPageForm {
  slug: string;
  title: string;
  description: string;
  project: { name: string; color: string | null };
}

/**
 * The forms listed on /feedback (D-139): published, switched on in the form's
 * settings, and only from projects whose intake is on. Cached like the forms
 * themselves; every form and project change that could move one in or out of
 * the list calls updateTag(feedbackPageTag).
 */
export async function getFeedbackPage(): Promise<{
  workspaceName: string | null;
  forms: FeedbackPageForm[];
}> {
  "use cache";
  cacheTag(feedbackPageTag);
  cacheLife("hours");
  const [rows, workspaces] = await Promise.all([
    db.intakeForm.findMany({
      where: { ...liveForm, settings: { path: ["showOnFeedbackPage"], equals: true } },
      orderBy: [{ project: { name: "asc" } }, { title: "asc" }],
      select: {
        slug: true,
        title: true,
        description: true,
        project: { select: { name: true, color: true } },
      },
    }),
    // One deployment is one workspace (VTK); with several, the page names none.
    db.workspace.findMany({ select: { name: true }, take: 2 }),
  ]);
  return {
    workspaceName: workspaces.length === 1 ? (workspaces[0]?.name ?? null) : null,
    forms: rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      description: docToPlainText(r.description as PMNode | null),
      project: { name: r.project.name, color: r.project.color },
    })),
  };
}
