"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Ban, Plus, Trash2 } from "lucide-react";
import { createIgnoreRuleAction, deleteIgnoreRuleAction } from "@/server/actions/mail";
import { useRelativeTime } from "@/lib/use-relative-time";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
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
import { mailKeys } from "./data";
import type { IgnoreRuleView } from "./types";

type Field = IgnoreRuleView["field"];

/** Mirrors CreateIgnoreRuleSchema: shorter text would ignore far too much. */
const MIN_LENGTH = 3;

interface Draft {
  field: Field;
  value: string;
  applyToOpen: boolean;
}

/** Adds a rule, says how many open conversations it ignored, refreshes Mail and Settings. */
function useCreateRule(ws: string, mailboxId: string) {
  const t = useTranslations("mail.ignoreRules");
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const create = async (draft: Draft) => {
    setBusy(true);
    const res = await createIgnoreRuleAction(ws, { mailboxId, ...draft });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error === "invalid_input" ? t("tooShort") : t("error"));
      return false;
    }
    toast.success(
      draft.applyToOpen ? t("addedWithCount", { count: res.data.ignored }) : t("added"),
    );
    void qc.invalidateQueries({ queryKey: mailKeys.all(ws) });
    router.refresh();
    return true;
  };
  return { create, busy };
}

/** Sender/Subject, the text to look for, and whether to clean up what's open now. */
function RuleFields({
  draft,
  onChange,
  autoFocus,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations("mail.ignoreRules");
  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SegmentedControl
          label={t("field")}
          value={draft.field}
          onValueChange={(v) => onChange({ ...draft, field: v as Field })}
          className="self-start"
        >
          <SegmentedControlItem value="SENDER" data-testid="ignore-rule-sender">
            {t("fieldSENDER")}
          </SegmentedControlItem>
          <SegmentedControlItem value="SUBJECT" data-testid="ignore-rule-subject">
            {t("fieldSUBJECT")}
          </SegmentedControlItem>
        </SegmentedControl>
        <span className="hidden text-small text-fg-muted sm:inline">{t("contains")}</span>
        <Input
          value={draft.value}
          onChange={(e) => onChange({ ...draft, value: e.target.value })}
          placeholder={draft.field === "SENDER" ? t("senderPlaceholder") : t("subjectPlaceholder")}
          aria-label={t("value")}
          maxLength={200}
          autoFocus={autoFocus}
          className="min-w-0 flex-1"
          data-testid="ignore-rule-value"
        />
      </div>
      <label className="inline-flex items-center gap-2 self-start text-small text-fg-secondary">
        <Checkbox
          checked={draft.applyToOpen}
          onCheckedChange={(v) => onChange({ ...draft, applyToOpen: v === true })}
          data-testid="ignore-rule-apply"
        />
        {t("applyToOpen")}
      </label>
    </>
  );
}

const ready = (d: Draft) => d.value.trim().length >= MIN_LENGTH;

/** Settings → Mailboxes → one mailbox: the rules, and a form to add one. */
export function IgnoreRules({
  ws,
  mailboxId,
  rules,
}: {
  ws: string;
  mailboxId: string;
  rules: IgnoreRuleView[];
}) {
  const t = useTranslations("mail.ignoreRules");
  const relative = useRelativeTime();
  const router = useRouter();
  const { create, busy } = useCreateRule(ws, mailboxId);
  const [draft, setDraft] = useState<Draft>({ field: "SENDER", value: "", applyToOpen: true });
  const [removing, setRemoving] = useState<string | null>(null);

  const remove = async (id: string) => {
    setRemoving(id);
    const res = await deleteIgnoreRuleAction(ws, { id });
    setRemoving(null);
    if (!res.ok) toast.error(t("error"));
    else router.refresh();
  };

  return (
    <>
      {rules.length ? (
        <ul
          className="overflow-hidden rounded-card border border-border"
          data-testid="ignore-rules"
        >
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-0"
              data-testid="ignore-rule"
            >
              <span className="inline-flex h-6 shrink-0 items-center rounded-chip bg-surface-muted px-2 text-caption font-medium text-fg-secondary">
                {t(`ruleLabel${r.field}`)}
              </span>
              <span className="min-w-0 flex-1 truncate text-body text-fg">{r.value}</span>
              <span className="hidden shrink-0 text-small text-fg-muted sm:inline">
                {r.createdBy ? `${r.createdBy.name} · ` : ""}
                <span suppressHydrationWarning>{relative(r.createdAt)}</span>
              </span>
              <Tooltip content={t("remove")}>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("remove")}
                  loading={removing === r.id}
                  onClick={() => void remove(r.id)}
                >
                  <Trash2 />
                </Button>
              </Tooltip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-fg-muted">{t("empty")}</p>
      )}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready(draft) || busy) return;
          void create(draft).then((ok) => ok && setDraft({ ...draft, value: "" }));
        }}
      >
        <RuleFields draft={draft} onChange={setDraft} />
        <Button
          type="submit"
          variant="secondary"
          className="self-start"
          loading={busy}
          disabled={!ready(draft)}
          data-testid="ignore-rule-add"
        >
          <Plus />
          {t("add")}
        </Button>
      </form>
    </>
  );
}

/** From the reader: "never show me mail like this again", prefilled from the thread. */
export function IgnoreRuleDialog({
  ws,
  mailboxId,
  initial,
  open,
  onClose,
}: {
  ws: string;
  mailboxId: string;
  initial: { field: Field; value: string };
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("mail.ignoreRules");
  const { create, busy } = useCreateRule(ws, mailboxId);
  const [draft, setDraft] = useState<Draft>({ ...initial, applyToOpen: true });
  // A new prefill (another field picked from the menu) replaces the draft.
  const [seen, setSeen] = useState(initial);
  if (seen.field !== initial.field || seen.value !== initial.value) {
    setSeen(initial);
    setDraft({ ...initial, applyToOpen: true });
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md" data-testid="ignore-rule-dialog">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready(draft) || busy) return;
            void create(draft).then((ok) => ok && onClose());
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <RuleFields draft={draft} onChange={setDraft} autoFocus />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={!ready(draft)}
              data-testid="ignore-rule-submit"
            >
              <Ban />
              {t("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
