/**
 * Intake (Phase 3): form definitions, public submissions, triage actions and
 * the simplified public status (Q-12). Pure and shared by web + worker.
 */
import { z } from "zod";
import { DateOnlySchema, PrioritySchema, RichTextSchema, TitleSchema } from "./work-item";

/* ───────────────────────── form definition ───────────────────────── */

export const FormFieldTypeSchema = z.enum([
  "SHORT_TEXT",
  "LONG_TEXT",
  "SELECT",
  "MULTI_SELECT",
  "DATE",
  "FILE",
  "EMAIL",
  "CHECKBOX",
]);
export type FormFieldType = z.infer<typeof FormFieldTypeSchema>;

export const FormFieldTargetSchema = z.enum([
  "NONE",
  "TITLE",
  "DESCRIPTION",
  "PRIORITY",
  "TYPE",
  "LABELS",
  "DUE_DATE",
  "CONTACT_EMAIL",
  "CONTACT_NAME",
]);
export type FormFieldTarget = z.infer<typeof FormFieldTargetSchema>;

export const MIME_PRESETS = {
  images: ["image/png", "image/jpeg", "image/gif", "image/webp"],
  documents: [
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  logs: ["text/plain", "application/json", "application/zip", "application/gzip"],
} as const;

/**
 * Which targets make sense for which field types. Every public form asks for
 * the submitter's email and name itself, so the CONTACT_* targets (kept in the
 * enum for stored data) aren't offered.
 */
export const targetsByType: Record<FormFieldType, FormFieldTarget[]> = {
  SHORT_TEXT: ["NONE", "TITLE"],
  LONG_TEXT: ["NONE", "DESCRIPTION"],
  SELECT: ["NONE", "PRIORITY", "TYPE"],
  MULTI_SELECT: ["NONE", "LABELS"],
  DATE: ["NONE", "DUE_DATE"],
  FILE: ["NONE"],
  EMAIL: ["NONE"],
  CHECKBOX: ["NONE"],
};

/** Built-in safe upload types when a form doesn't list its own. */
export const DEFAULT_MIME_TYPES: string[] = [
  ...new Set<string>([...MIME_PRESETS.images, ...MIME_PRESETS.documents, ...MIME_PRESETS.logs]),
];

/** Stable machine key; submissions store values under it. */
export const FieldKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, "Lowercase letters, digits and _ only");

export const FieldOptionSchema = z.object({
  value: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(100),
});
export type FieldOption = z.infer<typeof FieldOptionSchema>;
export const FieldOptionsSchema = z.array(FieldOptionSchema).max(50);

export const FormFieldInputSchema = z.object({
  key: FieldKeySchema,
  label: z.string().trim().min(1).max(120),
  type: FormFieldTypeSchema,
  required: z.boolean().default(false),
  helpText: z.string().trim().max(300).nullish(),
  placeholder: z.string().trim().max(120).nullish(),
  options: FieldOptionsSchema.default([]),
  target: FormFieldTargetSchema.default("NONE"),
});
export type FormFieldInput = z.input<typeof FormFieldInputSchema>;
export type FormField = z.infer<typeof FormFieldInputSchema>;

const OriginSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\/+$/, ""))
  .pipe(z.url({ protocol: /^https?$/ }))
  .refine((v) => new URL(v).origin === v, "Use an origin like https://example.com");

export const FormSettingsSchema = z.object({
  successMessage: z.string().trim().max(500).default(""),
  /** Applied to the work item unless a field maps to the same property. */
  defaults: z
    .object({
      typeId: z.uuid().nullish(),
      priority: PrioritySchema.default("NONE"),
      labelIds: z.array(z.uuid()).max(30).default([]),
    })
    .default({ priority: "NONE", labelIds: [] }),
  /** Who hears about new submissions; empty = the project's admins and lead. */
  notifyUserIds: z.array(z.uuid()).max(50).default([]),
  turnstileEnabled: z.boolean().default(false),
  /** Empty = the form may be embedded anywhere. */
  allowedEmbedOrigins: z.array(OriginSchema).max(20).default([]),
  maxFileSizeMb: z.number().int().min(1).max(25).default(10),
  maxFiles: z.number().int().min(1).max(10).default(5),
  /** Empty = the built-in safe list (images, documents, logs). */
  allowedMimeTypes: z.array(z.string().trim().min(3).max(120)).max(50).default([]),
});
export type FormSettings = z.infer<typeof FormSettingsSchema>;

export const FormThemeSchema = z.object({
  buttonText: z.string().trim().min(1).max(40).default("Feedback"),
  position: z.enum(["bottom-right", "bottom-left"]).default("bottom-right"),
});
export type FormTheme = z.infer<typeof FormThemeSchema>;

export const FormSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/, "Lowercase letters, digits and dashes");

export const CreateFormSchema = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(1).max(120),
});

export const SaveFormSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).default(""),
    slug: FormSlugSchema,
    settings: FormSettingsSchema,
    theme: FormThemeSchema,
    fields: z.array(FormFieldInputSchema).min(1).max(40),
  })
  .superRefine((form, ctx) => {
    const keys = new Set<string>();
    const targets = new Set<FormFieldTarget>();
    form.fields.forEach((f, i) => {
      if (keys.has(f.key))
        ctx.addIssue({ code: "custom", path: ["fields", i, "key"], message: "duplicate_key" });
      keys.add(f.key);
      if (!targetsByType[f.type].includes(f.target))
        ctx.addIssue({ code: "custom", path: ["fields", i, "target"], message: "invalid_target" });
      if (f.target !== "NONE") {
        if (targets.has(f.target))
          ctx.addIssue({
            code: "custom",
            path: ["fields", i, "target"],
            message: "duplicate_target",
          });
        targets.add(f.target);
      }
      if ((f.type === "SELECT" || f.type === "MULTI_SELECT") && f.options.length === 0)
        ctx.addIssue({ code: "custom", path: ["fields", i, "options"], message: "no_options" });
    });
  });
export type SaveFormInput = z.input<typeof SaveFormSchema>;

/** The form every new project form starts from. */
export function defaultFormFields(): FormField[] {
  return [
    {
      key: "summary",
      label: "Summary",
      type: "SHORT_TEXT",
      required: true,
      helpText: null,
      placeholder: "What do you need help with?",
      options: [],
      target: "TITLE",
    },
    {
      key: "details",
      label: "Details",
      type: "LONG_TEXT",
      required: false,
      helpText: "Steps to reproduce, error messages, what you expected to happen.",
      placeholder: null,
      options: [],
      target: "DESCRIPTION",
    },
    {
      key: "attachments",
      label: "Screenshots or files",
      type: "FILE",
      required: false,
      helpText: null,
      placeholder: null,
      options: [],
      target: "NONE",
    },
  ];
}

/* ───────────────────────── submissions ───────────────────────── */

export const SHORT_TEXT_MAX = 300;
export const LONG_TEXT_MAX = 10_000;

/** What a public form needs to render (never includes settings secrets). */
export interface PublicFormDefinition {
  id: string;
  slug: string;
  title: string;
  description: string;
  workspaceName: string;
  successMessage: string;
  turnstileSiteKey: string | null;
  allowedEmbedOrigins: string[];
  maxFileSizeMb: number;
  maxFiles: number;
  accept: string[];
  fields: Array<{
    key: string;
    label: string;
    type: FormFieldType;
    required: boolean;
    helpText: string | null;
    placeholder: string | null;
    options: FieldOption[];
    target: FormFieldTarget;
  }>;
}

type FieldDef = Pick<FormField, "key" | "type" | "required" | "options">;

/** zod schema for the `values` of one form, built from its fields. */
export function buildValuesSchema(fields: FieldDef[], limits: { maxFiles: number }) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) {
    const allowed = f.options.map((o) => o.value);
    let s: z.ZodType;
    switch (f.type) {
      case "SHORT_TEXT":
        s = f.required
          ? z.string().trim().min(1).max(SHORT_TEXT_MAX)
          : z.string().trim().max(SHORT_TEXT_MAX).optional();
        break;
      case "LONG_TEXT":
        s = f.required
          ? z.string().trim().min(1).max(LONG_TEXT_MAX)
          : z.string().trim().max(LONG_TEXT_MAX).optional();
        break;
      case "EMAIL":
        s = f.required
          ? z.email().max(254)
          : z.union([z.email().max(254), z.literal("")]).optional();
        break;
      case "DATE":
        s = f.required ? DateOnlySchema : z.union([DateOnlySchema, z.literal("")]).optional();
        break;
      case "SELECT": {
        const one = z.string().refine((v) => allowed.includes(v), "invalid_option");
        s = f.required ? one : z.union([one, z.literal("")]).optional();
        break;
      }
      case "MULTI_SELECT": {
        const many = z
          .array(z.string().refine((v) => allowed.includes(v), "invalid_option"))
          .max(allowed.length);
        s = f.required ? many.min(1) : many.optional();
        break;
      }
      case "CHECKBOX":
        s = f.required ? z.literal(true) : z.boolean().optional();
        break;
      case "FILE": {
        const files = z.array(z.uuid()).max(limits.maxFiles);
        s = f.required ? files.min(1) : files.optional();
        break;
      }
    }
    shape[f.key] = s;
  }
  return z.object(shape);
}

export const PublicSubmitSchema = z.object({
  /** Client-generated; retries and double clicks create one submission. */
  clientSubmissionId: z.uuid(),
  email: z.email().max(254),
  name: z.string().trim().max(120).optional(),
  values: z.record(z.string(), z.unknown()),
  /** Honeypot: humans never see or fill this field. */
  website: z.string().max(500).optional(),
  /** When the form was rendered (ms since epoch), for the minimum fill time. */
  startedAt: z.number().int().nonnegative(),
  turnstileToken: z.string().max(4096).optional(),
  embedOrigin: z.string().max(300).optional(),
});
export type PublicSubmitInput = z.infer<typeof PublicSubmitSchema>;

/** Minimum time between rendering the form and submitting it. */
export const MIN_FILL_MS = 2_000;

export const RATE_LIMITS = {
  /** Per IP, per form: the 21st submission within 10 minutes is refused. */
  submitPerIp: { limit: 20, windowSec: 600 },
  submitPerEmail: { limit: 10, windowSec: 600 },
  uploadPerIp: { limit: 60, windowSec: 600 },
  replyPerToken: { limit: 20, windowSec: 600 },
} as const;

/* ───────────────────────── in-app and triage ───────────────────────── */

export const GuestRequestSchema = z.object({
  projectId: z.uuid(),
  title: TitleSchema,
  description: RichTextSchema.nullish(),
});
export type GuestRequestInput = z.input<typeof GuestRequestSchema>;

export const AcceptIntakeSchema = z.object({
  id: z.uuid(),
  stateId: z.uuid().nullish(),
  priority: PrioritySchema.optional(),
  assigneeIds: z.array(z.uuid()).max(20).optional(),
  labelIds: z.array(z.uuid()).max(30).optional(),
});
export type AcceptIntakeInput = z.input<typeof AcceptIntakeSchema>;

export const DeclineIntakeSchema = z.object({
  id: z.uuid(),
  reason: z.string().trim().max(2000).default(""),
  notify: z.boolean().default(true),
});

export const DuplicateIntakeSchema = z.object({
  id: z.uuid(),
  duplicateOfId: z.uuid(),
  notify: z.boolean().default(true),
});

export const SnoozeIntakeSchema = z.object({
  id: z.uuid(),
  /** null wakes it up now. */
  until: z.iso.datetime({ offset: true }).nullable(),
});

export const IntakeTabSchema = z.enum(["pending", "snoozed", "accepted", "declined", "duplicate"]);
export type IntakeTab = z.infer<typeof IntakeTabSchema>;

/* ───────────────────────── public status (Q-12) ───────────────────────── */

export type PublicStatus = "received" | "in_progress" | "resolved" | "declined" | "duplicate";

/**
 * What a submitter sees. Internal state names never leave Dopl: the status is
 * derived from the intake decision and the work item's state group.
 */
export function publicStatus(
  intake: "PENDING" | "ACCEPTED" | "DECLINED" | "DUPLICATE",
  stateGroup: string,
): PublicStatus {
  if (intake === "DECLINED") return "declined";
  if (intake === "DUPLICATE") return "duplicate";
  if (intake === "PENDING") return "received";
  if (stateGroup === "COMPLETED") return "resolved";
  if (stateGroup === "CANCELLED") return "declined";
  if (stateGroup === "STARTED") return "in_progress";
  return "received";
}

export const StatusReplySchema = z.object({
  body: z.string().trim().min(1).max(LONG_TEXT_MAX),
  attachmentIds: z.array(z.uuid()).max(5).default([]),
});
