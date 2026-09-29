"use client";

import { useTranslations } from "next-intl";
import { useTypingUsers } from "./typing";

/** "Ann is typing…" above the composer; the line keeps its height so nothing jumps. */
export function TypingLine({
  ws,
  channelId,
  threadRootId,
  me,
}: {
  ws: string;
  channelId: string;
  threadRootId: string | null;
  me: string;
}) {
  const t = useTranslations("messages");
  const names = useTypingUsers(ws, channelId, threadRootId, me);
  const first = (n: string) => n.split(" ")[0] ?? n;
  const text =
    names.length === 0
      ? ""
      : names.length === 1
        ? t("typing.one", { name: first(names[0] ?? "") })
        : names.length === 2
          ? t("typing.two", { a: first(names[0] ?? ""), b: first(names[1] ?? "") })
          : t("typing.many");
  return (
    <p
      aria-live="polite"
      data-testid="typing-indicator"
      className="flex h-5 items-center gap-1.5 truncate px-1 text-caption text-fg-muted"
    >
      {text ? (
        <>
          <span className="inline-flex gap-0.5" aria-hidden>
            <span className="size-1 animate-pulse rounded-full bg-neutral-400" />
            <span className="size-1 animate-pulse rounded-full bg-neutral-400 [animation-delay:150ms]" />
            <span className="size-1 animate-pulse rounded-full bg-neutral-400 [animation-delay:300ms]" />
          </span>
          {text}
        </>
      ) : null}
    </p>
  );
}
