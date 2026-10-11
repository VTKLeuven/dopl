"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Check, Hash, Layers } from "lucide-react";
import { canAdd } from "@dopl/shared/domain/home";
import { RANGES, type Range } from "@dopl/shared/schemas/analytics";
import {
  HOME_CHARTS,
  NOTE_COUNTS,
  type HomeLayout,
  type HomeWidget,
  type HomeWidgetType,
  type NoteCount,
} from "@dopl/shared/schemas/home";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { useTags } from "@/features/notes/data";
import {
  buildWidget,
  CATALOG,
  defaultDraft,
  draftOf,
  isAvailable,
  NEEDS_SETUP,
  WIDGET_ICONS,
  type HomeCapabilities,
  type WidgetDraft,
} from "./catalog";
import { useViewOptions } from "./data";

/* ───────────────────────── settings form ───────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-small font-medium text-fg-secondary">{label}</span>
      {children}
    </div>
  );
}

function Picker({
  label,
  placeholder,
  empty,
  options,
  value,
  onChange,
  loading = false,
}: {
  label: string;
  placeholder: string;
  empty: string;
  options: Array<{ value: string; label: string; detail?: string | null; icon?: React.ReactNode }>;
  value: string | undefined;
  onChange: (value: string) => void;
  loading?: boolean;
}) {
  return (
    <Field label={label}>
      <Command className="rounded-control border border-border" label={label}>
        <CommandInput placeholder={placeholder} />
        <CommandList className="max-h-56">
          <CommandEmpty>{loading ? "…" : empty}</CommandEmpty>
          {options.map((o) => (
            <CommandItem
              key={o.value}
              value={`${o.label} ${o.detail ?? ""} ${o.value}`}
              onSelect={() => onChange(o.value)}
              data-checked={o.value === value}
            >
              {o.icon}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.detail ? (
                <span className="shrink-0 text-small text-fg-muted">{o.detail}</span>
              ) : null}
              <Check
                className={cn("text-sky-700", o.value === value ? "opacity-100" : "opacity-0")}
                aria-hidden
              />
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </Field>
  );
}

/** The settings of one widget type; edits a draft. */
function WidgetForm({
  ws,
  type,
  draft,
  onChange,
}: {
  ws: string;
  type: HomeWidgetType;
  draft: WidgetDraft;
  onChange: (draft: WidgetDraft) => void;
}) {
  const t = useTranslations("home.settings");
  const ta = useTranslations("analytics");
  const tags = useTags(ws);
  const views = useViewOptions(ws, type === "view");
  const set = (patch: WidgetDraft) => onChange({ ...draft, ...patch });
  return (
    <div className="flex flex-col gap-5">
      {type === "taggedNotes" ? (
        <Picker
          label={t("tag")}
          placeholder={t("tagSearch")}
          empty={t("tagEmpty")}
          loading={tags.isPending}
          options={(tags.data ?? []).map((tag, _, all) => ({
            value: tag.path,
            label: tag.path,
            // Like the notes sidebar: the tag and every tag below it.
            detail: String(
              all
                .filter((x) => x.path === tag.path || x.path.startsWith(`${tag.path}/`))
                .reduce((n, x) => n + x.count, 0),
            ),
            icon: <Hash className="text-icon" />,
          }))}
          value={draft.tag}
          onChange={(tag) => set({ tag })}
        />
      ) : null}
      {type === "view" ? (
        <Picker
          label={t("view")}
          placeholder={t("viewSearch")}
          empty={t("viewEmpty")}
          loading={views.isPending}
          options={(views.data ?? []).map((v) => ({
            value: v.id,
            label: v.name,
            detail: v.projectName,
            icon: <Layers className="text-icon" />,
          }))}
          value={draft.viewId}
          onChange={(viewId) => set({ viewId })}
        />
      ) : null}
      {type === "chart" ? (
        <>
          <Picker
            label={t("chart")}
            placeholder={t("chartSearch")}
            empty={t("chartEmpty")}
            options={HOME_CHARTS.map((key) => ({ value: key, label: ta(`default.${key}`) }))}
            value={draft.chart}
            onChange={(chart) => set({ chart: chart as WidgetDraft["chart"] })}
          />
          <Field label={t("range")}>
            <SegmentedControl
              label={t("range")}
              value={draft.range ?? "90d"}
              onValueChange={(v) => set({ range: v as Range })}
              className="self-start"
            >
              {RANGES.map((r) => (
                <SegmentedControlItem key={r} value={r}>
                  {ta(`range.${r}`)}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </Field>
        </>
      ) : null}
      {type === "recentNotes" || type === "sharedNotes" || type === "taggedNotes" ? (
        <Field label={t("count")}>
          <SegmentedControl
            label={t("count")}
            value={String(draft.count ?? 6)}
            onValueChange={(v) => set({ count: Number(v) as NoteCount })}
            className="self-start"
          >
            {NOTE_COUNTS.map((n) => (
              <SegmentedControlItem key={n} value={String(n)} data-testid={`count-${n}`}>
                {n}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </Field>
      ) : null}
    </div>
  );
}

/* ───────────────────────── add widget ───────────────────────── */

/**
 * The widget catalogue. One-off widgets already on Home are shown but
 * disabled; widgets that need a choice (a tag, a view, a chart) open their
 * settings first.
 */
export function AddWidgetDialog({
  ws,
  open,
  onOpenChange,
  layout,
  caps,
  onAdd,
}: {
  ws: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: HomeLayout;
  caps: HomeCapabilities;
  onAdd: (widget: HomeWidget) => void;
}) {
  const t = useTranslations("home");
  const [setup, setSetup] = useState<{ type: HomeWidgetType; draft: WidgetDraft } | null>(null);
  const close = (o: boolean) => {
    if (!o) setSetup(null);
    onOpenChange(o);
  };
  const add = (type: HomeWidgetType, draft: WidgetDraft) => {
    const widget = buildWidget(type, draft);
    if (!widget) return;
    onAdd(widget);
    close(false);
  };
  const ready = setup ? buildWidget(setup.type, setup.draft) !== null : false;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size={setup ? "md" : "lg"} data-testid="add-widget-dialog">
        <DialogHeader>
          <DialogTitle>{setup ? t(`widgets.${setup.type}.name`) : t("edit.addWidget")}</DialogTitle>
          <DialogDescription>
            {setup ? t(`widgets.${setup.type}.description`) : t("catalog.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {setup ? (
            <WidgetForm
              ws={ws}
              type={setup.type}
              draft={setup.draft}
              onChange={(draft) => setSetup({ ...setup, draft })}
            />
          ) : (
            <div className="flex flex-col gap-5">
              {CATALOG.map(({ group, types }) => {
                const shown = types.filter((type) => isAvailable(type, caps));
                if (shown.length === 0) return null;
                return (
                  <section key={group} className="flex flex-col gap-2">
                    <h3 className="text-caption font-medium text-fg-muted uppercase">
                      {t(`catalog.${group}`)}
                    </h3>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {shown.map((type) => {
                        const Icon = WIDGET_ICONS[type];
                        const available = canAdd(layout, type);
                        return (
                          <button
                            key={type}
                            type="button"
                            disabled={!available}
                            data-testid={`catalog-${type}`}
                            onClick={() =>
                              NEEDS_SETUP.has(type)
                                ? setSetup({ type, draft: defaultDraft(type) })
                                : add(type, defaultDraft(type))
                            }
                            className={cn(
                              "group flex items-start gap-3 rounded-card border border-border bg-surface px-3.5 py-3 text-left focus-ring",
                              "transition-colors duration-[var(--dur-fast)] hover:border-border-strong hover:bg-surface-hover",
                              "disabled:cursor-default disabled:bg-surface-muted disabled:hover:border-border",
                            )}
                          >
                            <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-sky-50 text-sky-700 group-disabled:bg-neutral-150 group-disabled:text-icon">
                              <Icon className="size-4" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-body font-medium text-fg group-disabled:text-fg-muted">
                                {t(`widgets.${type}.name`)}
                              </span>
                              <span className="block text-small text-fg-muted">
                                {available ? t(`widgets.${type}.description`) : t("catalog.onHome")}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </DialogBody>
        {setup ? (
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSetup(null)} className="mr-auto">
              <ArrowLeft />
              {t("catalog.back")}
            </Button>
            <Button
              variant="primary"
              disabled={!ready}
              onClick={() => add(setup.type, setup.draft)}
              data-testid="add-widget-confirm"
            >
              {t("edit.addWidget")}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── widget settings ───────────────────────── */

export function WidgetSettingsDialog({
  ws,
  widget,
  onClose,
  onSave,
}: {
  ws: string;
  widget: HomeWidget | null;
  onClose: () => void;
  onSave: (widget: HomeWidget) => void;
}) {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const [draft, setDraft] = useState<WidgetDraft>({});
  const [forId, setForId] = useState<string | null>(null);
  // Each opening starts from the widget's saved settings (reset during render, not in an effect).
  if (widget && widget.id !== forId) {
    setForId(widget.id);
    setDraft(draftOf(widget));
  } else if (!widget && forId !== null) {
    setForId(null);
  }
  const next = widget ? buildWidget(widget.type, draft, widget.id, widget.zone) : null;
  return (
    <Dialog open={Boolean(widget)} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent size="md" data-testid="widget-settings">
        <DialogHeader>
          <DialogTitle>
            {widget ? t("settings.title", { name: t(`widgets.${widget.type}.name`) }) : null}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {widget ? (
            <WidgetForm ws={ws} type={widget.type} draft={draft} onChange={setDraft} />
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!next}
            onClick={() => {
              if (next) onSave(next);
            }}
            data-testid="widget-settings-save"
          >
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
