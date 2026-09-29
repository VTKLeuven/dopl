"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  AlarmClock,
  Check,
  ChevronDown,
  ExternalLink,
  EyeOff,
  Link2,
  Lock,
  Paperclip,
  Reply,
  RotateCcw,
  Send,
  SquareArrowOutUpRight,
  Tags,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import { RichTextEditor, type EditorSources } from "@/components/editor/rich-text-editor";
import { RichTextView } from "@/components/editor/rich-text-view";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Tag, TagDot } from "@/components/ui/tag";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StateIcon } from "@/components/icons/state-icon";
import { ProjectBadge } from "@/components/shell/project-badge";
import { SnoozeMenu } from "@/features/inbox/snooze-menu";
import { useProjects } from "@/features/notes/data";
import { Picker } from "@/features/work-items/pickers";
import { useThread, useThreadActions } from "./data";
import { EmailFrame } from "./email-frame";
import { useThreadPresence } from "./presence";
import type { EmailCommentView, MessageView, Person, ThreadDetail } from "./types";

/** The thread reader: header actions, messages and internal notes by time, the composer. */
export function ThreadReader({ ws, threadId, me }: { ws: string; threadId: string; me: string }) {
  const t = useTranslations("mail.reader");
  const { data: thread, isPending, isError, refetch } = useThread(ws, threadId);
  if (isPending) return <ReaderSkeleton />;
  if (isError || !thread)
    return (
      <EmptyState
        title={t("errorTitle")}
        description={t("errorDescription")}
        action={
          <Button variant="secondary" onClick={() => void refetch()}>
            {t("retry")}
          </Button>
        }
      />
    );
  return <Reader ws={ws} thread={thread} me={me} />;
}

function ReaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6" aria-busy>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-8 w-80" />
      <Skeleton className="h-40 w-full rounded-card" />
      <Skeleton className="h-28 w-full rounded-card" />
    </div>
  );
}

type Entry =
  | { kind: "message"; at: string; m: MessageView }
  | { kind: "comment"; at: string; c: EmailCommentView };

function Reader({ ws, thread, me }: { ws: string; thread: ThreadDetail; me: string }) {
  const t = useTranslations("mail.reader");
  const fmt = useFormatter();
  const actions = useThreadActions(ws);
  const [replying, setReplying] = useState(false);
  const [dialog, setDialog] = useState<"promote" | "link" | null>(null);
  const presence = useThreadPresence(ws, thread.id, me, replying);
  const entries = useMemo<Entry[]>(
    () =>
      [
        ...thread.messages.map((m) => ({ kind: "message" as const, at: m.sentAt, m })),
        ...thread.comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, c })),
      ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)),
    [thread.messages, thread.comments],
  );
  const snoozed = thread.snoozedUntil && new Date(thread.snoozedUntil) > new Date();
  const canAct = thread.canAct;

  return (
    <article
      className="flex min-h-0 flex-1 flex-col"
      data-testid="thread-reader"
      aria-label={thread.subject}
    >
      <header className="flex flex-col gap-3 border-b border-border px-5 py-4 md:px-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-title font-semibold text-fg" data-testid="thread-subject">
              {thread.subject}
            </h2>
            <p className="mt-0.5 text-small text-fg-muted">
              {thread.correspondent
                ? (thread.correspondent.name ?? thread.correspondent.email)
                : null}
              {thread.correspondent ? " · " : null}
              {thread.mailbox.displayName ?? thread.mailbox.emailAddress}
            </p>
          </div>
          {presence.length ? (
            <div
              className="flex items-center gap-1.5 text-small text-fg-muted"
              data-testid="thread-presence"
            >
              {presence.slice(0, 3).map((p) => (
                <Tooltip key={p.userId} content={p.name}>
                  <span>
                    <Avatar user={{ id: p.userId, name: p.name, image: null }} size="xs" />
                  </span>
                </Tooltip>
              ))}
              <span>
                {presence.some((p) => p.state === "REPLYING")
                  ? t("presenceReplying", {
                      name: presence.find((p) => p.state === "REPLYING")?.name ?? "",
                    })
                  : t("presenceViewing", { count: presence.length, name: presence[0]?.name ?? "" })}
              </span>
            </div>
          ) : null}
        </div>

        {canAct ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="thread-actions">
            {thread.status === "OPEN" ? (
              <Button
                variant="primary"
                size="sm"
                data-testid="thread-solve"
                onClick={() => actions.setStatus.mutate({ threadId: thread.id, status: "SOLVED" })}
              >
                <Check />
                {t("solve")}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                data-testid="thread-reopen"
                onClick={() => actions.setStatus.mutate({ threadId: thread.id, status: "OPEN" })}
              >
                <RotateCcw />
                {thread.status === "IGNORED" ? t("unignore") : t("reopen")}
              </Button>
            )}
            <AssigneePicker
              people={thread.assignable}
              value={thread.assignee}
              onChange={(assignee) => actions.assign.mutate({ threadId: thread.id, assignee })}
            />
            {snoozed ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => actions.snooze.mutate({ threadId: thread.id, until: null })}
              >
                <AlarmClock />
                {t("unsnooze", {
                  when: fmt.dateTime(new Date(thread.snoozedUntil ?? ""), {
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </Button>
            ) : (
              <SnoozeMenu
                align="start"
                onSnooze={(until) =>
                  actions.snooze.mutate({ threadId: thread.id, until: until.toISOString() })
                }
              >
                <Button variant="secondary" size="sm" data-testid="thread-snooze">
                  <AlarmClock />
                  {t("snooze")}
                  <ChevronDown />
                </Button>
              </SnoozeMenu>
            )}
            <LabelPicker ws={ws} thread={thread} />
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDialog("link")}
                data-testid="thread-link"
              >
                <Link2 />
                {t("link")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDialog("promote")}
                data-testid="thread-promote"
              >
                <SquareArrowOutUpRight />
                {t("promote")}
              </Button>
            </div>
          </div>
        ) : null}

        {thread.labels.length || thread.items.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {thread.items.map((i) => (
              <Link
                key={i.id}
                href={`/${ws}/i/${i.identifier}` as never}
                className="inline-flex h-6 items-center gap-1.5 rounded-chip border border-border bg-surface px-2 text-small font-medium text-fg-secondary focus-ring hover:border-border-strong"
                data-testid="thread-item"
              >
                <StateIcon group={i.stateGroup as never} size={12} />
                <span className="tabular">{i.identifier}</span>
                <span className="max-w-48 truncate font-normal text-fg-muted">{i.title}</span>
              </Link>
            ))}
            {thread.labels.map((l) => (
              <Tag key={l.id} color={l.color}>
                {l.name}
              </Tag>
            ))}
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto px-5 py-5 md:px-6">
        <ol className="flex flex-col gap-4">
          {entries.map((e, i) =>
            e.kind === "message" ? (
              <MessageCard key={e.m.id} ws={ws} m={e.m} open={i >= entries.length - 2} />
            ) : (
              <CommentCard key={e.c.id} c={e.c} />
            ),
          )}
        </ol>
      </div>

      {canAct ? (
        <Composer
          thread={thread}
          onFocusChange={setReplying}
          onNote={(body) => actions.comment.mutateAsync({ threadId: thread.id, body })}
          onReply={(body, replyAll) =>
            actions.reply.mutateAsync({ threadId: thread.id, body, replyAll })
          }
        />
      ) : null}

      <PromoteDialog
        ws={ws}
        thread={thread}
        open={dialog === "promote"}
        onClose={() => setDialog(null)}
      />
      <LinkDialog
        thread={thread}
        ws={ws}
        open={dialog === "link"}
        onClose={() => setDialog(null)}
      />
    </article>
  );
}

function addressLine(list: Array<{ email: string; name: string | null }>) {
  return list.map((a) => a.name ?? a.email).join(", ");
}

function MessageCard({
  ws,
  m,
  open: initiallyOpen,
}: {
  ws: string;
  m: MessageView;
  open: boolean;
}) {
  const t = useTranslations("mail.reader");
  const relative = useRelativeTime();
  const fmt = useFormatter();
  const [open, setOpen] = useState(initiallyOpen);
  const outbound = m.direction === "OUTBOUND";
  const files = m.attachments.filter((a) => !a.isInline);
  return (
    <li
      data-testid="email-message"
      data-direction={m.direction}
      className={cn(
        "rounded-card border bg-surface shadow-card",
        outbound ? "border-sky-200" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left focus-ring"
      >
        <Avatar
          user={{ id: m.from.email, name: m.from.name ?? m.from.email, image: null }}
          size="sm"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-body font-semibold text-fg">
              {m.from.name ?? m.from.email}
            </span>
            {m.from.name ? (
              <span className="truncate text-small text-fg-muted">{m.from.email}</span>
            ) : null}
          </span>
          <span className="block truncate text-small text-fg-muted">
            {open
              ? `${t("to")} ${addressLine(m.to)}${m.cc.length ? ` · ${t("cc")} ${addressLine(m.cc)}` : ""}`
              : (m.text ?? "").slice(0, 160)}
          </span>
        </span>
        <time
          dateTime={m.sentAt}
          title={fmt.dateTime(new Date(m.sentAt), { dateStyle: "medium", timeStyle: "short" })}
          className="shrink-0 text-small text-fg-muted tabular"
          suppressHydrationWarning
        >
          {relative(m.sentAt)}
        </time>
      </button>
      {open ? (
        <div className="flex flex-col gap-3 pr-4 pb-4 pl-13">
          {m.outboundStatus && m.outboundStatus !== "SENT" ? (
            <p
              className={cn(
                "text-small",
                m.outboundStatus === "FAILED" ? "text-danger-text" : "text-fg-muted",
              )}
            >
              {t(`outbound.${m.outboundStatus}`)}
              {m.outboundError ? `: ${m.outboundError}` : ""}
            </p>
          ) : null}
          {m.html ? (
            <EmailFrame
              html={m.html}
              text={m.text ?? ""}
              title={t("frameTitle", { from: m.from.email })}
            />
          ) : (
            <p className="text-body whitespace-pre-wrap text-fg" data-testid="email-text">
              {m.text}
            </p>
          )}
          {m.hasRemoteImages ? (
            <p className="inline-flex items-center gap-1.5 text-small text-fg-muted">
              <EyeOff className="size-3.5" />
              {t("remoteImagesHidden")}
            </p>
          ) : null}
          {files.length ? (
            <ul className="flex flex-wrap gap-2">
              {files.map((a) => (
                <li key={a.id}>
                  <a
                    href={`/api/v1/${ws}/mail/attachments/${a.id}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex h-8 items-center gap-1.5 rounded-chip border border-border bg-surface px-2.5 text-small text-fg-secondary focus-ring hover:border-border-strong"
                    data-testid="email-attachment"
                  >
                    <Paperclip className="size-3.5 text-icon" />
                    <span className="max-w-56 truncate">{a.filename}</span>
                    <span className="text-fg-muted tabular">
                      {fmt.number(a.size / 1024, { maximumFractionDigits: 0 })} KB
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Internal notes look different from mail on purpose: tinted, locked, "Internal". */
function CommentCard({ c }: { c: EmailCommentView }) {
  const t = useTranslations("mail.reader");
  const relative = useRelativeTime();
  return (
    <li
      className="rounded-card border border-warning-border bg-warning-bg px-4 py-3"
      data-testid="email-comment"
    >
      <p className="mb-1.5 flex items-center gap-2 text-small text-fg-muted">
        {c.author ? <Avatar user={c.author} size="xs" /> : null}
        <span className="font-medium text-fg-secondary">{c.author?.name ?? t("someone")}</span>
        <span className="inline-flex items-center gap-1 font-medium text-warning-text">
          <Lock className="size-3" />
          {t("internal")}
        </span>
        <span className="ml-auto tabular" suppressHydrationWarning>
          {relative(c.createdAt)}
        </span>
      </p>
      <RichTextView doc={c.body} />
    </li>
  );
}

/**
 * The composer: a reply to the customer (when the mailbox allows replies) or
 * an internal note. The two look different on purpose, so a note is never
 * sent by mistake.
 */
function Composer({
  thread,
  onFocusChange,
  onNote,
  onReply,
}: {
  thread: ThreadDetail;
  onFocusChange: (focused: boolean) => void;
  onNote: (body: unknown) => Promise<unknown>;
  onReply: (body: unknown, replyAll: boolean) => Promise<unknown>;
}) {
  const t = useTranslations("mail.reader");
  const canReply = thread.mailbox.sendEnabled;
  const [mode, setMode] = useState<"reply" | "note">(canReply ? "reply" : "note");
  const [value, setValue] = useState<unknown>(null);
  const [key, setKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [replyAll, setReplyAll] = useState(false);
  const sources = usePeopleSources(thread.assignable);
  const lastInbound = [...thread.messages].reverse().find((m) => m.direction === "INBOUND");
  const others = lastInbound
    ? [...lastInbound.to, ...lastInbound.cc].filter(
        (a) => a.email.toLowerCase() !== thread.mailbox.emailAddress.toLowerCase(),
      )
    : [];
  const recipients = lastInbound
    ? [
        lastInbound.from.name ?? lastInbound.from.email,
        ...(replyAll ? others.map((a) => a.name ?? a.email) : []),
      ]
    : [];
  const reply = mode === "reply";

  const submit = async () => {
    if (!value || busy) return;
    setBusy(true);
    try {
      await (reply ? onReply(value, replyAll) : onNote(value));
      setValue(null);
      setKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="border-t border-border px-5 py-3 md:px-6"
      onFocus={() => onFocusChange(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onFocusChange(false);
      }}
      data-testid="thread-composer"
    >
      {canReply ? (
        <SegmentedControl
          label={t("composerMode")}
          value={mode}
          onValueChange={(v) => setMode(v as "reply" | "note")}
          className="mb-2"
        >
          <SegmentedControlItem value="reply" data-testid="composer-reply">
            <Reply />
            {t("reply")}
          </SegmentedControlItem>
          <SegmentedControlItem value="note" data-testid="composer-note">
            <Lock />
            {t("internalNote")}
          </SegmentedControlItem>
        </SegmentedControl>
      ) : null}
      <div
        className={cn(
          "rounded-card border px-3 py-2",
          reply ? "border-border-strong bg-surface" : "border-warning-border bg-warning-bg",
        )}
      >
        {reply ? (
          <p className="mb-1 flex flex-wrap items-center gap-x-2 text-caption text-fg-muted">
            <span>
              {t("replyTo")}{" "}
              <span className="font-medium text-fg-secondary">{recipients.join(", ")}</span>
            </span>
            {others.length ? (
              <label className="inline-flex items-center gap-1.5">
                <Checkbox checked={replyAll} onCheckedChange={(v) => setReplyAll(v === true)} />
                {t("replyAll")}
              </label>
            ) : null}
          </p>
        ) : (
          <p className="mb-1 flex items-center gap-1.5 text-caption font-medium text-warning-text">
            <Lock className="size-3" />
            {t("noteHint")}
          </p>
        )}
        <RichTextEditor
          key={`${mode}:${key}`}
          value={null}
          onChange={setValue}
          onSubmit={() => void submit()}
          placeholder={reply ? t("replyPlaceholder") : t("notePlaceholder")}
          sources={sources}
          minHeight="min-h-[44px]"
        />
        <div className="mt-2 flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void submit()}
            loading={busy}
            data-testid={reply ? "reply-submit" : "note-submit"}
          >
            {reply ? <Send /> : null}
            {reply ? t("send") : t("addNote")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** @mentions limited to people who can read the mailbox. */
function usePeopleSources(people: Person[]): EditorSources {
  const t = useTranslations("mail.reader");
  return useMemo(
    () => ({
      emptyLabel: t("noPeople"),
      people: (query: string) =>
        people
          .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 8)
          .map((p) => ({ id: p.id, label: p.name, icon: <Avatar user={p} size="xs" /> })),
    }),
    [people, t],
  );
}

function AssigneePicker({
  people,
  value,
  onChange,
}: {
  people: Person[];
  value: Person | null;
  onChange: (p: Person | null) => void;
}) {
  const t = useTranslations("mail.reader");
  return (
    <Picker
      placeholder={t("assignPlaceholder")}
      options={[
        { value: "none", label: t("unassigned"), icon: <UserRound className="size-4 text-icon" /> },
        ...people.map((p) => ({ value: p.id, label: p.name, icon: <Avatar user={p} size="xs" /> })),
      ]}
      selected={[value?.id ?? "none"]}
      onChange={([v]) =>
        onChange(v && v !== "none" ? (people.find((p) => p.id === v) ?? null) : null)
      }
      trigger={
        <Button variant="secondary" size="sm" data-testid="thread-assignee">
          {value ? <Avatar user={value} size="xs" /> : <UserRound />}
          {value?.name ?? t("unassigned")}
          <ChevronDown />
        </Button>
      }
    />
  );
}

/** Workspace labels on the thread: tick existing ones, or type a new name and press Enter. */
function LabelPicker({ ws, thread }: { ws: string; thread: ThreadDetail }) {
  const t = useTranslations("mail.reader");
  const { labels: save } = useThreadActions(ws);
  const [draft, setDraft] = useState("");
  const selected = new Set(thread.labels.map((l) => l.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save.mutate({ threadId: thread.id, labelIds: [...next] });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" data-testid="thread-labels">
          <Tags />
          {t("labels")}
          <ChevronDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <ul className="max-h-60 overflow-y-auto">
          {thread.labelOptions.map((l) => (
            <li key={l.id}>
              <label className="flex h-8 cursor-pointer items-center gap-2 rounded-control px-2 text-body hover:bg-surface-hover">
                <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} />
                <TagDot color={l.color} />
                <span className="truncate">{l.name}</span>
              </label>
            </li>
          ))}
        </ul>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("newLabel")}
          aria-label={t("newLabel")}
          className="mt-1"
          maxLength={40}
          data-testid="new-label"
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              save.mutate({ threadId: thread.id, labelIds: [...selected], create: [draft.trim()] });
              setDraft("");
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function PromoteDialog({
  ws,
  thread,
  open,
  onClose,
}: {
  ws: string;
  thread: ThreadDetail;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("mail.promote");
  const router = useRouter();
  const { promote } = useThreadActions(ws);
  const { data: projects = [] } = useProjects(ws, open);
  const [title, setTitle] = useState(thread.subject);
  const [projectId, setProjectId] = useState<string | null>(null);
  const project = projects.find((p) => p.id === projectId);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" data-testid="promote-dialog">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-fg-secondary">{t("itemTitle")}</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-fg-secondary">{t("project")}</span>
            <Picker
              placeholder={t("projectPlaceholder")}
              options={projects.map((p) => ({
                value: p.id,
                label: p.name,
                keywords: [p.identifier],
                icon: <ProjectBadge name={p.name} color={p.color} size={16} />,
              }))}
              selected={projectId ? [projectId] : []}
              onChange={([v]) => setProjectId(v ?? null)}
              trigger={
                <Button variant="secondary" className="justify-start" data-testid="promote-project">
                  {project ? (
                    <ProjectBadge name={project.name} color={project.color} size={16} />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-left">
                    {project?.name ?? t("projectPlaceholder")}
                  </span>
                  <ChevronDown />
                </Button>
              }
            />
          </div>
          <p className="text-small text-fg-muted">{t("untrusted")}</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!project || !title.trim()}
            loading={promote.isPending}
            data-testid="promote-submit"
            onClick={() =>
              project &&
              promote.mutate(
                { threadId: thread.id, projectId: project.id, title: title.trim() },
                {
                  onSuccess: (r) => {
                    onClose();
                    router.push(`/${ws}/i/${r.identifier}` as never);
                  },
                },
              )
            }
          >
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkDialog({
  ws,
  thread,
  open,
  onClose,
}: {
  ws: string;
  thread: ThreadDetail;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("mail.link");
  const { link } = useThreadActions(ws);
  const [item, setItem] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" data-testid="link-dialog">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Input
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            autoFocus
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!item.trim()}
            loading={link.isPending}
            data-testid="link-submit"
            onClick={() =>
              link.mutate(
                { threadId: thread.id, item: item.trim().toUpperCase() },
                { onSuccess: onClose },
              )
            }
          >
            <ExternalLink />
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
