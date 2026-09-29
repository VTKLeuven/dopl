import { z } from "zod";

export const WorkspaceRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "GUEST"]);

export const InviteMembersSchema = z.object({
  emails: z
    .string()
    .transform((s) =>
      Array.from(
        new Set(
          s
            .split(/[\s,;]+/)
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean),
        ),
      ),
    )
    .pipe(
      z
        .array(z.email("One of the addresses isn't valid."))
        .min(1, "Add at least one address.")
        .max(50),
    ),
  role: WorkspaceRoleSchema.default("MEMBER"),
  projectIds: z.array(z.uuid()).default([]),
});
export type InviteMembersInput = z.input<typeof InviteMembersSchema>;

export const ChangeRoleSchema = z.object({ memberId: z.uuid(), role: WorkspaceRoleSchema });
