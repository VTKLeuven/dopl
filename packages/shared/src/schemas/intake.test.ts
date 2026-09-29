import { describe, expect, it } from "vitest";
import {
  buildValuesSchema,
  defaultFormFields,
  publicStatus,
  SaveFormSchema,
  type FormField,
} from "./intake";

const field = (f: Partial<FormField> & Pick<FormField, "key" | "type">): FormField => ({
  label: f.key,
  required: false,
  helpText: null,
  placeholder: null,
  options: [],
  target: "NONE",
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
