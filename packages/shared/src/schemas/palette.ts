import { z } from "zod";

/** Tag / label / note colour tokens (DESIGN_SYSTEM §3.4). Stored by name. */
export const tagColors = [
  "purple",
  "red",
  "green",
  "lime",
  "blue",
  "amber",
  "pink",
  "teal",
  "orange",
  "grey",
] as const;
export const TagColorSchema = z.enum(tagColors);
export type TagColor = z.infer<typeof TagColorSchema>;

/** Stable colour for a string (avatars, fallbacks). */
export function colorForString(value: string): TagColor {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return tagColors[hash % (tagColors.length - 1)] ?? "grey"; // never grey for people
}
