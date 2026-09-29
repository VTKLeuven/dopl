import { Avatar as A } from "radix-ui";
import { colorForString } from "@dopl/shared/palette";
import { cn } from "@/lib/cn";
import { tagClasses } from "@/lib/palette";

const sizes = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-caption",
  lg: "size-10 text-body",
} as const;
export type AvatarSize = keyof typeof sizes;

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export interface AvatarUser {
  id: string;
  name: string;
  image?: string | null;
  kind?: "HUMAN" | "AGENT" | "SYSTEM";
}

export function Avatar({
  user,
  size = "sm",
  className,
  working = false,
}: {
  user: AvatarUser;
  size?: AvatarSize;
  className?: string;
  /** Agent only: rotating gradient ring while a run is active. */
  working?: boolean;
}) {
  if (user.kind === "AGENT") return <AgentAvatar size={size} className={className} working={working} name={user.name} />;
  const color = tagClasses[colorForString(user.id)];
  return (
    <A.Root
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold ring-2 ring-surface",
        sizes[size],
        className,
      )}
      title={user.name}
    >
      {user.image ? <A.Image src={user.image} alt="" className="size-full object-cover" /> : null}
      <A.Fallback delayMs={user.image ? 400 : 0} className={cn("flex size-full items-center justify-center", color.avatar)}>
        {initials(user.name)}
      </A.Fallback>
    </A.Root>
  );
}

/** The AI teammate: the brand mark inside a gradient ring (DESIGN_SYSTEM §5). */
export function AgentAvatar({
  size = "sm",
  className,
  working = false,
  name = "Dopl",
}: {
  size?: AvatarSize;
  className?: string;
  working?: boolean;
  name?: string;
}) {
  return (
    <span
      title={name}
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full", sizes[size], className)}
    >
      <span
        aria-hidden
        className={cn("absolute inset-0 rounded-full bg-brand-gradient", working && "animate-agent-spin")}
      />
      <span className="absolute inset-[1.5px] rounded-full bg-surface" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/dopl-mark-192.png" alt="" className="relative size-[62%] object-contain" />
    </span>
  );
}

export function AvatarStack({
  users,
  max = 3,
  size = "sm",
}: {
  users: AvatarUser[];
  max?: number;
  size?: AvatarSize;
}) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((u, i) => (
        <Avatar key={u.id} user={u} size={size} className={i > 0 ? "-ml-1" : undefined} />
      ))}
      {rest > 0 ? (
        <span className="tabular ml-1 text-small font-medium text-fg-muted">+{rest}</span>
      ) : null}
    </span>
  );
}
