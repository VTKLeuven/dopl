"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { addDays, addHours, nextMonday, setHours, startOfDay } from "date-fns";
import { AlarmClock, Check, CopyCheck, RotateCcw, SquareArrowOutUpRight, X } from "lucide-react";
import type { IntakeTab } from "@dopl/shared/schemas/intake";
import type { Priority } from "@dopl/shared/schemas/work-item";
import type { IntakeRow } from "@/server/queries/intake";
import type { ActionResult } from "@/server/action-result";
import {
  acceptIntakeAction,
  declineIntakeAction,
  markDuplicateAction,
  reopenIntakeAction,
  snoozeIntakeAction,
} from "@/server/actions/intake";
import { Button } from "@/components/ui/button";
import { Shortcut } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { StateIcon } from "@/components/icons/state-icon";
import {
  AssigneePicker,
  LabelPicker,
  PriorityPicker,
  StatePicker,
} from "@/features/work-items/pickers";
import { useItemSearch } from "@/features/work-items/data";
import type { ProjectMeta } from "@/features/work-items/types";
import { useTriage } from "./data";

export type TriagePanel = "accept" | "decline" | "duplicate" | "snooze" | null;

/**
 * The decision bar on a request (ROADMAP Phase 3.1): accept with state,
 * assignees, labels and priority; decline with a reason; mark as a
 * duplicate of an existing item; snooze. Shortcuts Y, N, U, Z.
 */
export function TriageBar({
  ws,
  row,
  meta,
  tab,
  panel,
  onPanel,
  onDone,
}: {
  ws: string;
  row: IntakeRow;
  meta: ProjectMeta;
  tab: IntakeTab;
  panel: TriagePanel;
  onPanel: (p: TriagePanel) => void;
  onDone: () => void;
}) {
  const t = useTranslations("intake");
  const triage = useTriage(ws, meta.project.id, tab);
  const act = (
    kind: Parameters<typeof triage.mutate>[0]["kind"],
    run: () => Promise<ActionResult<unknown>>,
  ) => {
    onPanel(null);
    onDone();
    triage.mutate({ id: row.id, kind, run });
  };

  if (row.status === "ACCEPTED")
    return (
      <Bar>
        <span className="text-small text-fg-muted">{t("acceptedAs")}</span>
        {row.identifier ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={`/${ws}/i/${row.identifier}` as never}>
              <SquareArrowOutUpRight />
              <span className="tabular">{row.identifier}</span>
            </Link>
          </Button>
        ) : null}
      </Bar>
    );
  if (row.status === "DECLINED" || row.status === "DUPLICATE")
    return (
      <Bar>
        <span className="min-w-0 flex-1 truncate text-small text-fg-muted">
          {row.status === "DUPLICATE"
            ? t("duplicateOf", { id: row.duplicateOf ?? "" })
            : t("declinedNote")}
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => act("reopen", () => reopenIntakeAction(ws, row.id))}
        >
          <RotateCcw />
          {t("reopen")}
        </Button>
      </Bar>
    );

  const snoozed = tab === "snoozed";
  return (
    <Bar>
      <AcceptPopover
        meta={meta}
        row={row}
        open={panel === "accept"}
        onOpenChange={(o) => onPanel(o ? "accept" : null)}
        onAccept={(input) => act("accept", () => acceptIntakeAction(ws, { id: row.id, ...input }))}
      />
      <Tooltip content={t("decline")} shortcut="n">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onPanel("decline")}
          data-testid="triage-decline"
        >
          <X />
          {t("decline")}
        </Button>
      </Tooltip>
      <DuplicatePopover
        ws={ws}
        row={row}
        open={panel === "duplicate"}
        onOpenChange={(o) => onPanel(o ? "duplicate" : null)}
        onPick={(duplicateOfId) =>
          act("duplicate", () =>
            markDuplicateAction(ws, { id: row.id, duplicateOfId, notify: true }),
          )
        }
      />
      {snoozed ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => act("unsnooze", () => snoozeIntakeAction(ws, { id: row.id, until: null }))}
        >
          <AlarmClock />
          {t("unsnooze")}
        </Button>
      ) : (
        <SnoozeMenu
          open={panel === "snooze"}
          onOpenChange={(o) => onPanel(o ? "snooze" : null)}
          onSnooze={(until) =>
            act("snooze", () => snoozeIntakeAction(ws, { id: row.id, until: until.toISOString() }))
          }
        />
      )}
      <DeclineDialog
        open={panel === "decline"}
        onOpenChange={(o) => onPanel(o ? "decline" : null)}
        submitter={row.submitter?.name ?? null}
        onDecline={(reason, notify) =>
          act("decline", () => declineIntakeAction(ws, { id: row.id, reason, notify }))
        }
      />
    </Bar>
  );
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-12 flex-wrap items-center gap-2 border-b border-border bg-surface-muted px-4 py-2"
      data-testid="triage-bar"
    >
      {children}
    </div>
  );
}

function AcceptPopover({
  meta,
  row,
  open,
  onOpenChange,
  onAccept,
}: {
  meta: ProjectMeta;
  row: IntakeRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAccept: (input: {
    stateId: string;
    priority: Priority;
    assigneeIds: string[];
    labelIds?: string[];
  }) => void;
}) {
  const t = useTranslations("intake");
  const ti = useTranslations("items");
  const initialState = meta.states.find((s) => s.isDefault)?.id ?? meta.states[0]?.id ?? "";
  const [stateId, setStateId] = useState(initialState);
  const [priority, setPriority] = useState<Priority>(row.priority);
  const [assigneeIds, setAssignees] = useState<string[]>([]);
  const [labelIds, setLabels] = useState<string[] | undefined>(undefined);
  const submit = () =>
    onAccept({ stateId, priority, assigneeIds, ...(labelIds ? { labelIds } : {}) });
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip content={t("accept")} shortcut="y">
        <PopoverTrigger asChild>
          <Button size="sm" variant="primary" data-testid="triage-accept">
            <Check />
            {t("accept")}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        align="start"
        className="flex w-[320px] flex-col gap-3 p-3"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      >
        <p className="text-body font-semibold">{t("acceptTitle")}</p>
        <PropertyRow label={ti("prop.state")}>
          <StatePicker meta={meta} value={stateId} onChange={setStateId} variant="field" />
        </PropertyRow>
        <PropertyRow label={ti("prop.priority")}>
          <PriorityPicker value={priority} onChange={setPriority} variant="field" />
        </PropertyRow>
        <PropertyRow label={ti("prop.assignees")}>
          <AssigneePicker meta={meta} value={assigneeIds} onChange={setAssignees} variant="field" />
        </PropertyRow>
        <PropertyRow label={ti("prop.labels")}>
          <LabelPicker meta={meta} value={labelIds ?? []} onChange={setLabels} variant="field" />
        </PropertyRow>
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <span className="text-caption text-fg-muted">{t("acceptHint")}</span>
          <Button
            size="sm"
            variant="primary"
            onClick={submit}
            autoFocus
            data-testid="triage-accept-confirm"
          >
            {t("accept")}
            <Shortcut keys="mod+enter" tone="inverted" className="ml-1" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2">
      <span className="text-small text-fg-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function DeclineDialog({
  open,
  onOpenChange,
  submitter,
  onDecline,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  submitter: string | null;
  onDecline: (reason: string, notify: boolean) => void;
}) {
  const t = useTranslations("intake");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" closeLabel={t("cancel")}>
        <DialogHeader>
          <DialogTitle>{t("declineTitle")}</DialogTitle>
          <DialogDescription>{t("declineHint")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="decline-reason">{t("reason")}</Label>
            <Textarea
              id="decline-reason"
              rows={4}
              value={reason}
              autoFocus
              placeholder={t("reasonPlaceholder")}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {submitter ? (
            <label className="flex items-center justify-between gap-3 text-body">
              <span>{t("notifySubmitter", { name: submitter })}</span>
              <Switch checked={notify} onCheckedChange={setNotify} />
            </label>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => onDecline(reason.trim(), notify)}
            data-testid="triage-decline-confirm"
          >
            {t("decline")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DuplicatePopover({
  ws,
  row,
  open,
  onOpenChange,
  onPick,
}: {
  ws: string;
  row: IntakeRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (id: string) => void;
}) {
  const t = useTranslations("intake");
  const [q, setQ] = useState("");
  const { data: hits = [] } = useItemSearch(ws, q || row.title.slice(0, 40), undefined, open);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip content={t("duplicate")} shortcut="u">
        <PopoverTrigger asChild>
          <Button size="sm" variant="secondary">
            <CopyCheck />
            {t("duplicate")}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start" className="w-[360px] p-0">
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder={t("duplicateSearch")} />
          <CommandList>
            <CommandEmpty>{t("noMatches")}</CommandEmpty>
            {hits.map((h) => (
              <CommandItem key={h.id} value={h.id} onSelect={() => onPick(h.id)}>
                <StateIcon group={h.stateGroup} />
                <span className="shrink-0 text-fg-muted tabular">{h.identifier}</span>
                <span className="truncate">{h.title}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SnoozeMenu({
  open,
  onOpenChange,
  onSnooze,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSnooze: (until: Date) => void;
}) {
  const t = useTranslations("intake");
  const [custom, setCustom] = useState<string>("");
  const [customOpen, setCustomOpen] = useState(false);
  const now = new Date();
  const presets: Array<{ key: "laterToday" | "tomorrow" | "nextWeek"; at: Date }> = [
    { key: "laterToday", at: addHours(now, 3) },
    { key: "tomorrow", at: setHours(startOfDay(addDays(now, 1)), 9) },
    { key: "nextWeek", at: setHours(startOfDay(nextMonday(now)), 9) },
  ];
  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <Tooltip content={t("snooze")} shortcut="z">
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">
              <AlarmClock />
              {t("snooze")}
            </Button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent align="start">
          {presets.map((p) => (
            <DropdownMenuItem key={p.key} onSelect={() => onSnooze(p.at)}>
              {t(`snoozePreset.${p.key}`)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCustomOpen(true)}>
            {t("snoozeCustom")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent size="sm" closeLabel={t("cancel")}>
          <DialogHeader>
            <DialogTitle>{t("snoozeCustom")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Input
              type="datetime-local"
              value={custom}
              aria-label={t("snoozeUntil")}
              onChange={(e) => setCustom(e.target.value)}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCustomOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={!custom || new Date(custom) <= new Date()}
              onClick={() => {
                setCustomOpen(false);
                onSnooze(new Date(custom));
              }}
            >
              {t("snooze")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
