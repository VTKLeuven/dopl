import { describe, expect, it } from "vitest";
import {
  buildValuesSchema,
  defaultFormFields,
  localizePublicForm,
  publicStatus,
  PublicFormQuerySchema,
  SaveFormSchema,
  type FormField,
  type PublicFormDefinition,
} from "./intake";

const field = (f: Partial<FormField> & Pick<FormField, "key" | "type">): FormField => ({
  label: f.key,
  required: false,
  helpText: null,
  placeholder: null,
  options: [],
  target: "NONE",
  translations: {},
  ...f,
});

describe("form values", () => {
  const fields = [
    field({ key: "summary", type: "SHORT_TEXT", required: true, target: "TITLE" }),
    field({ key: "details", type: "LONG_TEXT" }),
    field({
      key: "urgency",
      type: "SELECT",
      options: [
        { value: "low", label: "Low" },
        { value: "high", label: "High" },
      ],
    }),
    field({
      key: "areas",
      type: "MULTI_SELECT",
      options: [
        { value: "wifi", label: "Wi-Fi" },
        { value: "mail", label: "Mail" },
      ],
    }),
    field({ key: "when", type: "DATE" }),
    field({ key: "agree", type: "CHECKBOX", required: true }),
    field({ key: "files", type: "FILE" }),
  ];
  const schema = buildValuesSchema(fields, { maxFiles: 2 });

  it("accepts a valid submission and optional blanks", () => {
    const r = schema.safeParse({ summary: "Printer", urgency: "", when: "", agree: true });
    expect(r.success).toBe(true);
  });
  it("rejects missing required values, unknown options and too many files", () => {
    expect(schema.safeParse({ agree: true }).success).toBe(false);
    expect(schema.safeParse({ summary: "x", agree: false }).success).toBe(false);
    expect(schema.safeParse({ summary: "x", agree: true, urgency: "nope" }).success).toBe(false);
    expect(schema.safeParse({ summary: "x", agree: true, areas: ["dns"] }).success).toBe(false);
    expect(schema.safeParse({ summary: "x", agree: true, when: "tomorrow" }).success).toBe(false);
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    expect(schema.safeParse({ summary: "x", agree: true, files: ids }).success).toBe(false);
  });
  it("drops keys the form doesn't define", () => {
    const r = schema.parse({ summary: "x", agree: true, injected: "<script>" });
    expect(r).not.toHaveProperty("injected");
  });
});

describe("form definitions", () => {
  const base = {
    id: crypto.randomUUID(),
    title: "IT support",
    slug: "it-support",
    settings: {},
    theme: {},
  };
  it("accepts the default fields", () => {
    expect(SaveFormSchema.safeParse({ ...base, fields: defaultFormFields() }).success).toBe(true);
  });
  it("rejects duplicate keys, duplicate or mismatched targets and empty selects", () => {
    const dupKey = [
      field({ key: "a", type: "SHORT_TEXT" }),
      field({ key: "a", type: "LONG_TEXT" }),
    ];
    expect(SaveFormSchema.safeParse({ ...base, fields: dupKey }).success).toBe(false);
    const dupTarget = [
      field({ key: "a", type: "SHORT_TEXT", target: "TITLE" }),
      field({ key: "b", type: "SHORT_TEXT", target: "TITLE" }),
    ];
    expect(SaveFormSchema.safeParse({ ...base, fields: dupTarget }).success).toBe(false);
    const badTarget = [field({ key: "a", type: "CHECKBOX", target: "TITLE" })];
    expect(SaveFormSchema.safeParse({ ...base, fields: badTarget }).success).toBe(false);
    const empty = [field({ key: "a", type: "SELECT" })];
    expect(SaveFormSchema.safeParse({ ...base, fields: empty }).success).toBe(false);
  });
  it("normalises embed origins and rejects paths", () => {
    const ok = SaveFormSchema.parse({
      ...base,
      fields: defaultFormFields(),
      settings: { allowedEmbedOrigins: ["https://vtk.be/"] },
    });
    expect(ok.settings.allowedEmbedOrigins).toEqual(["https://vtk.be"]);
    const bad = SaveFormSchema.safeParse({
      ...base,
      fields: defaultFormFields(),
      settings: { allowedEmbedOrigins: ["https://vtk.be/help"] },
    });
    expect(bad.success).toBe(false);
  });
});

describe("public status (Q-12)", () => {
  it("never exposes internal state names", () => {
    expect(publicStatus("PENDING", "TRIAGE")).toBe("received");
    expect(publicStatus("ACCEPTED", "BACKLOG")).toBe("received");
    expect(publicStatus("ACCEPTED", "STARTED")).toBe("in_progress");
    expect(publicStatus("ACCEPTED", "COMPLETED")).toBe("resolved");
    expect(publicStatus("ACCEPTED", "CANCELLED")).toBe("declined");
    expect(publicStatus("DECLINED", "TRIAGE")).toBe("declined");
    expect(publicStatus("DUPLICATE", "TRIAGE")).toBe("duplicate");
  });
});

describe("public form query", () => {
  it("reads the language and the prefill", () => {
    expect(
      PublicFormQuerySchema.parse({
        lang: "nl",
        email: "victor@student.kuleuven.be",
        name: " Victor Christiaens ",
      }),
    ).toEqual({ lang: "nl", email: "victor@student.kuleuven.be", name: "Victor Christiaens" });
  });

  it("defaults to English without prefill", () => {
    expect(PublicFormQuerySchema.parse({})).toEqual({ lang: "en" });
  });

  it("drops what doesn't fit instead of refusing the page", () => {
    expect(
      PublicFormQuerySchema.parse({ lang: "fr", email: "not-an-email", name: "x".repeat(121) }),
    ).toEqual({ lang: "en" });
    expect(PublicFormQuerySchema.parse({ name: "   " })).toEqual({ lang: "en" });
  });

  it("takes the first of repeated params", () => {
    expect(
      PublicFormQuerySchema.parse({ lang: ["nl", "en"], email: ["a@b.be", "c@d.be"] }),
    ).toEqual({
      lang: "nl",
      email: "a@b.be",
    });
  });
});

describe("localizePublicForm (D-143)", () => {
  const form: PublicFormDefinition = {
    id: "f",
    slug: "website-feedback",
    nl: { title: "Feedback over de site", description: null, successMessage: "Bedankt!" },
    title: "Website feedback",
    description: "Tell us what is wrong.",
    workspaceName: "VTK",
    onFeedbackPage: false,
    successMessage: "Thanks!",
    turnstileSiteKey: null,
    allowedEmbedOrigins: [],
    maxFileSizeMb: 10,
    maxFiles: 5,
    accept: [],
    fields: [
      {
        key: "summary",
        label: "Summary",
        type: "SHORT_TEXT",
        required: true,
        helpText: null,
        placeholder: "What do you need help with?",
        options: [],
        target: "TITLE",
        translations: {
          nl: { label: "Samenvatting", helpText: null, placeholder: "Waarmee kunnen we helpen?" },
        },
      },
      {
        key: "area",
        label: "Area",
        type: "SELECT",
        required: false,
        helpText: "Pick one.",
        placeholder: null,
        options: [
          { value: "tickets", label: "Tickets", labelNl: "Tickets" },
          { value: "shifts", label: "Shifts", labelNl: "Shiften" },
          { value: "other", label: "Other" },
        ],
        target: "NONE",
        translations: {},
      },
    ],
  };

  it("takes every Dutch word that was filled in and keeps the rest", () => {
    const nl = localizePublicForm(form, "nl");
    expect(nl.title).toBe("Feedback over de site");
    expect(nl.description).toBe("Tell us what is wrong.");
    expect(nl.successMessage).toBe("Bedankt!");
    expect(nl.fields[0]).toMatchObject({
      label: "Samenvatting",
      helpText: null,
      placeholder: "Waarmee kunnen we helpen?",
    });
    expect(nl.fields[1]?.helpText).toBe("Pick one.");
    expect(nl.fields[1]?.options.map((o) => o.label)).toEqual(["Tickets", "Shiften", "Other"]);
  });

  it("leaves English as typed and sends no translations to the client", () => {
    const en = localizePublicForm(form, "en");
    expect(en.title).toBe("Website feedback");
    expect(en.fields[0]?.label).toBe("Summary");
    expect(en.fields[1]?.options.map((o) => o.label)).toEqual(["Tickets", "Shifts", "Other"]);
    expect(en.fields.every((f) => Object.keys(f.translations).length === 0)).toBe(true);
    expect(en.fields[1]?.options.some((o) => "labelNl" in o)).toBe(false);
  });

  it("gives every new form Dutch words for its default fields", () => {
    const labels = defaultFormFields().map((f) => f.translations.nl?.label);
    expect(labels).toEqual(["Samenvatting", "Details", "Screenshots of bestanden"]);
  });
});
