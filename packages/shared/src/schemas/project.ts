import { z } from "zod";
import { TagColorSchema } from "./palette";

export const IDENTIFIER_RE = /^[A-Z][A-Z0-9]{1,9}$/;

export const ProjectIdentifierSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(IDENTIFIER_RE, "Use 2–10 letters or digits, starting with a letter."));

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(80),
  identifier: ProjectIdentifierSchema,
  color: TagColorSchema.default("blue"),
  visibility: z.enum(["WORKSPACE", "PRIVATE"]).default("WORKSPACE"),
  description: z.string().trim().max(2000).optional(),
});
export type CreateProjectInput = z.input<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  identifier: ProjectIdentifierSchema.optional(),
  color: TagColorSchema.optional(),
  visibility: z.enum(["WORKSPACE", "PRIVATE"]).optional(),
  guestsCanViewProject: z.boolean().optional(),
  estimateSystem: z.enum(["NONE", "POINTS", "HOURS"]).optional(),
  leadId: z.uuid().nullable().optional(),
});

/** Suggest an identifier from a name: "Network Ops" → "NETOPS". */
export function suggestIdentifier(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);
  let id = words.length > 1 ? words.map((w) => w.slice(0, 3)).join("") : (words[0] ?? "").slice(0, 5);
  id = id.replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (!/^[A-Z]/.test(id)) id = `P${id}`;
  return id.length >= 2 ? id : `${id}X`.slice(0, 2);
}
