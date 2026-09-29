import type { TagColor } from "@dopl/shared/palette";

/** Static class strings per tag colour so Tailwind can see them. */
export const tagClasses: Record<TagColor, { pill: string; dot: string; soft: string; text: string; avatar: string }> = {
  purple: { pill: "bg-tag-purple-bg border-tag-purple-border text-tag-purple-text", dot: "bg-tag-purple-solid", soft: "bg-tag-purple-bg", text: "text-tag-purple-text", avatar: "bg-tag-purple-border text-tag-purple-text" },
  red: { pill: "bg-tag-red-bg border-tag-red-border text-tag-red-text", dot: "bg-tag-red-solid", soft: "bg-tag-red-bg", text: "text-tag-red-text", avatar: "bg-tag-red-border text-tag-red-text" },
  green: { pill: "bg-tag-green-bg border-tag-green-border text-tag-green-text", dot: "bg-tag-green-solid", soft: "bg-tag-green-bg", text: "text-tag-green-text", avatar: "bg-tag-green-border text-tag-green-text" },
  lime: { pill: "bg-tag-lime-bg border-tag-lime-border text-tag-lime-text", dot: "bg-tag-lime-solid", soft: "bg-tag-lime-bg", text: "text-tag-lime-text", avatar: "bg-tag-lime-border text-tag-lime-text" },
  blue: { pill: "bg-tag-blue-bg border-tag-blue-border text-tag-blue-text", dot: "bg-tag-blue-solid", soft: "bg-tag-blue-bg", text: "text-tag-blue-text", avatar: "bg-tag-blue-border text-tag-blue-text" },
  amber: { pill: "bg-tag-amber-bg border-tag-amber-border text-tag-amber-text", dot: "bg-tag-amber-solid", soft: "bg-tag-amber-bg", text: "text-tag-amber-text", avatar: "bg-tag-amber-border text-tag-amber-text" },
  pink: { pill: "bg-tag-pink-bg border-tag-pink-border text-tag-pink-text", dot: "bg-tag-pink-solid", soft: "bg-tag-pink-bg", text: "text-tag-pink-text", avatar: "bg-tag-pink-border text-tag-pink-text" },
  teal: { pill: "bg-tag-teal-bg border-tag-teal-border text-tag-teal-text", dot: "bg-tag-teal-solid", soft: "bg-tag-teal-bg", text: "text-tag-teal-text", avatar: "bg-tag-teal-border text-tag-teal-text" },
  orange: { pill: "bg-tag-orange-bg border-tag-orange-border text-tag-orange-text", dot: "bg-tag-orange-solid", soft: "bg-tag-orange-bg", text: "text-tag-orange-text", avatar: "bg-tag-orange-border text-tag-orange-text" },
  grey: { pill: "bg-tag-grey-bg border-tag-grey-border text-tag-grey-text", dot: "bg-tag-grey-solid", soft: "bg-tag-grey-bg", text: "text-tag-grey-text", avatar: "bg-tag-grey-border text-tag-grey-text" },
};

export function tagClass(color: string | null | undefined) {
  return tagClasses[(color ?? "grey") as TagColor] ?? tagClasses.grey;
}
