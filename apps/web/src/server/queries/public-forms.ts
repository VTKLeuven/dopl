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
    where: {
      slug: slug.toLowerCase(),
      isPublished: true,
      archivedAt: null,
      deletedAt: null,
      project: { deletedAt: null, archivedAt: null, intakeEnabled: true },
    },
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
