"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Calendar,
  CheckSquare,
  ChevronDown,
  CircleDot,
  Code,
  ExternalLink,
  FileUp,
  Inbox,
  ListChecks,
  Mail,
  Plus,
  Trash,
  Type,
} from "lucide-react";
import {
  MIME_PRESETS,
  targetsByType,
  type FieldOption,
  type FormField,
  type FormFieldTarget,
  type FormFieldType,
  type FormSettings,
  type FormTheme,
  type PublicFormDefinition,
  DEFAULT_MIME_TYPES,
} from "@dopl/shared/schemas/intake";
import { priorities, type Priority } from "@dopl/shared/schemas/work-item";
import type { FormForEdit } from "@/server/queries/intake";
import { deleteFormAction, saveFormAction, setFormPublishedAction } from "@/server/actions/intake";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldHint, Input, Label, Textarea, inputClasses } from "@/components/ui/input";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { PageHeader } from "@/components/shell/page-header";
import { ProjectBadge } from "@/components/shell/project-badge";
import { SettingsSection } from "@/components/settings/section";
import {
  AssigneePicker,
  LabelPicker,
  PriorityPicker,
  TypePicker,
} from "@/features/work-items/pickers";
import type { ProjectMeta } from "@/features/work-items/types";
import { PublicForm } from "./public-form";

const TYPE_ICON: Record<FormFieldType, React.ReactNode> = {
  SHORT_TEXT: <Type />,
  LONG_TEXT: <AlignLeft />,
  SELECT: <CircleDot />,
  MULTI_SELECT: <ListChecks />,
  DATE: <Calendar />,
  FILE: <FileUp />,
  EMAIL: <Mail />,
  CHECKBOX: <CheckSquare />,
};
const FIELD_TYPES = Object.keys(TYPE_ICON) as FormFieldType[];
const MIME_GROUPS = Object.keys(MIME_PRESETS) as Array<keyof typeof MIME_PRESETS>;

interface Draft {
  title: string;
  description: string;
  slug: string;
  settings: FormSettings;
  theme: FormTheme;
  fields: FormField[];
}

const keyFrom = (label: string, taken: Set<string>) => {
  const base =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "f_$1")
      .slice(0, 36) || "field";
  let key = /^[a-z]/.test(base) ? base : `f_${base}`;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;
  return key;
};

/** Options for fields mapped to work-item properties come from the project. */
function derivedOptions(
  target: FormFieldTarget,
  meta: ProjectMeta,
  priorityLabel: (p: Priority) => string,
): FieldOption[] | null {
  if (target === "PRIORITY") return priorities.map((p) => ({ value: p, label: priorityLabel(p) }));
  if (target === "TYPE") return meta.types.map((ty) => ({ value: ty.id, label: ty.name }));
  if (target === "LABELS") return meta.labels.map((l) => ({ value: l.id, label: l.name }));
  return null;
}

/** Form builder (ROADMAP Phase 3.3): fields, mapping, settings, live preview, publish, embeds. */
export function FormBuilder({
  ws,
  appOrigin,
  project,
  form,
  meta,
  workspaceName,
  turnstileAvailable,
}: {
  ws: string;
  appOrigin: string;
  project: { id: string; identifier: string; name: string; color: string | null };
  form: FormForEdit;
  meta: ProjectMeta;
  workspaceName: string;
  turnstileAvailable: boolean;
}) {
  const t = useTranslations("forms");
  const ti = useTranslations("items");
  const router = useRouter();
  const initial: Draft = useMemo(
    () => ({
      title: form.title,
      description: form.description,
      slug: form.slug,
      settings: form.settings,
      theme: form.theme,
      fields: form.fields.map((f) => ({
        ...f,
        helpText: f.helpText ?? null,
        placeholder: f.placeholder ?? null,
      })),
    }),
    [form],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [published, setPublished] = useState(form.isPublished);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const dirty = JSON.stringify(draft) !== saved;
  const priorityLabel = (p: Priority) => ti(`priority.${p}`);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const patchSettings = (p: Partial<FormSettings>) =>
    setDraft((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  const patchField = (key: string, p: Partial<FormField>) =>
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f) => {
        if (f.key !== key) return f;
        const next = { ...f, ...p };
        if (p.type && !targetsByType[p.type].includes(next.target)) next.target = "NONE";
        const derived = derivedOptions(next.target, meta, priorityLabel);
        if (derived) next.options = derived;
        return next;
      }),
    }));
  const move = (index: number, delta: number) =>
    setDraft((d) => {
      const fields = [...d.fields];
      const [f] = fields.splice(index, 1);
      if (!f) return d;
      fields.splice(Math.min(Math.max(0, index + delta), fields.length), 0, f);
      return { ...d, fields };
    });
  const addField = (type: FormFieldType) => {
    const label = t(`type.${type}`);
    const key = keyFrom(label, new Set(draft.fields.map((f) => f.key)));
    const field: FormField = {
      key,
      label,
      type,
      required: false,
      helpText: null,
      placeholder: null,
      options:
        type === "SELECT" || type === "MULTI_SELECT"
          ? [
              { value: "option_1", label: t("optionN", { n: 1 }) },
              { value: "option_2", label: t("optionN", { n: 2 }) },
            ]
          : [],
      target: "NONE",
    };
    setDraft((d) => ({ ...d, fields: [...d.fields, field] }));
    setExpanded(key);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    // Mapped options are re-derived so renamed labels and new types show up.
    const fields = draft.fields.map((f) => ({
      ...f,
      options: derivedOptions(f.target, meta, priorityLabel) ?? f.options,
    }));
    const res = await saveFormAction(ws, { id: form.id, ...draft, fields });
    setSaving(false);
    if (res.ok) {
      setSaved(JSON.stringify({ ...draft, fields }));
      setDraft((d) => ({ ...d, fields }));
      setErrors({});
      toast(t("saved"));
      router.refresh();
    } else {
      setErrors(res.fields ?? {});
      toast.error(
        res.message === "slug_taken"
          ? t("errors.slugTaken")
          : res.error === "invalid_input"
            ? t("errors.invalid")
            : t("errors.generic"),
      );
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const togglePublished = async (next: boolean) => {
    if (next && dirty) await save();
    const res = await setFormPublishedAction(ws, form.id, next);
    if (res.ok) {
      setPublished(next);
      toast(next ? t("publishedToast") : t("unpublishedToast"));
    } else toast.error(t("errors.generic"));
  };

  const preview: PublicFormDefinition = {
    id: form.id,
    slug: draft.slug,
    title: draft.title || t("untitled"),
    description: draft.description,
    workspaceName,
    onFeedbackPage: draft.settings.showOnFeedbackPage,
    successMessage: draft.settings.successMessage,
    turnstileSiteKey: null,
    allowedEmbedOrigins: draft.settings.allowedEmbedOrigins,
    maxFileSizeMb: draft.settings.maxFileSizeMb,
    maxFiles: draft.settings.maxFiles,
    accept: draft.settings.allowedMimeTypes.length
      ? draft.settings.allowedMimeTypes
      : DEFAULT_MIME_TYPES,
    fields: draft.fields.map((f) => ({
      ...f,
      helpText: f.helpText ?? null,
      placeholder: f.placeholder ?? null,
      options: derivedOptions(f.target, meta, priorityLabel) ?? f.options,
    })),
  };
  const publicUrl = `${appOrigin}/f/${draft.slug}`;
  const base = `/${ws}/p/${project.identifier}/intake`;

  return (
    <>
      <PageHeader
        crumbs={[
          {
            label: project.name,
            icon: <ProjectBadge name={project.name} color={project.color} size={18} />,
            href: `/${ws}/p/${project.identifier}/items`,
          },
          { label: t("intake"), icon: <Inbox />, href: base },
          { label: t("title"), href: `${base}/forms` },
          { label: draft.title || t("untitled") },
        ]}
        actions={
          <>
            <label className="mr-1 hidden items-center gap-2 text-body text-fg-secondary sm:flex">
              <Switch
                checked={published}
                onCheckedChange={(v) => void togglePublished(v)}
                aria-label={t("publish")}
                data-testid="form-publish"
              />
              {published ? t("published") : t("draft")}
            </label>
            <Button variant="secondary" onClick={() => setEmbedOpen(true)} disabled={!published}>
              <Code />
              {t("embed")}
            </Button>
            {published ? (
              <Button asChild variant="secondary">
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  {t("open")}
                </a>
              </Button>
            ) : null}
            <Tooltip content={t("save")} shortcut="mod+s">
              <Button
                variant="primary"
                onClick={() => void save()}
                loading={saving}
                disabled={!dirty}
                data-testid="form-save"
              >
                {dirty ? t("save") : t("allSaved")}
              </Button>
            </Tooltip>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto lg:max-w-[640px] lg:border-r lg:border-border">
          <Section title={t("details")} description={t("detailsHint")}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fb-title">{t("formTitle")}</Label>
              <Input
                id="fb-title"
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fb-description">{t("description")}</Label>
              <Textarea
                id="fb-description"
                rows={3}
                value={draft.description}
                placeholder={t("descriptionPlaceholder")}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fb-slug">{t("address")}</Label>
              <div className="flex items-stretch">
                <span className="inline-flex items-center rounded-l-control border border-r-0 border-border-strong bg-surface-muted px-3 text-body text-fg-muted">
                  {appOrigin.replace(/^https?:\/\//, "")}/f/
                </span>
                <Input
                  id="fb-slug"
                  className="rounded-l-none"
                  value={draft.slug}
                  aria-invalid={errors.slug ? true : undefined}
                  onChange={(e) => patch({ slug: e.target.value.toLowerCase() })}
                />
              </div>
              {errors.slug ? (
                <FieldHint className="text-danger-text">{t("errors.slug")}</FieldHint>
              ) : null}
            </div>
            <label className="flex items-center justify-between gap-3">
              <span className="flex flex-col">
                <span className="text-body font-medium">{t("feedbackPage")}</span>
                <FieldHint>
                  {t("feedbackPageHint", {
                    url: `${appOrigin.replace(/^https?:\/\//, "")}/feedback`,
                  })}
                </FieldHint>
              </span>
              <Switch
                checked={draft.settings.showOnFeedbackPage}
                onCheckedChange={(showOnFeedbackPage) => patchSettings({ showOnFeedbackPage })}
                data-testid="form-feedback-page"
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fb-success">{t("successMessage")}</Label>
              <Textarea
                id="fb-success"
                rows={2}
                value={draft.settings.successMessage}
                placeholder={t("successPlaceholder")}
                onChange={(e) => patchSettings({ successMessage: e.target.value })}
              />
            </div>
          </Section>

          <Section title={t("fields")} description={t("fieldsHint")}>
            <ol className="flex flex-col gap-2" data-testid="form-fields">
              {draft.fields.map((f, i) => (
                <FieldCard
                  key={f.key}
                  field={f}
                  index={i}
                  count={draft.fields.length}
                  open={expanded === f.key}
                  onToggle={() => setExpanded((k) => (k === f.key ? null : f.key))}
                  onChange={(p) => patchField(f.key, p)}
                  onMove={(d) => move(i, d)}
                  onRemove={() =>
                    setDraft((d) => ({ ...d, fields: d.fields.filter((x) => x.key !== f.key) }))
                  }
                  takenTargets={
                    new Set(draft.fields.filter((x) => x.key !== f.key).map((x) => x.target))
                  }
                  derived={derivedOptions(f.target, meta, priorityLabel)}
                />
              ))}
            </ol>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" className="self-start" data-testid="add-field">
                  <Plus />
                  {t("addField")}
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {FIELD_TYPES.map((type) => (
                  <DropdownMenuItem key={type} onSelect={() => addField(type)}>
                    {TYPE_ICON[type]}
                    {t(`type.${type}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </Section>

          <Section title={t("routing")} description={t("routingHint")}>
            <div className="grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-2.5">
              <span className="text-small text-fg-muted">{ti("prop.type")}</span>
              <TypePicker
                meta={meta}
                value={draft.settings.defaults.typeId ?? null}
                onChange={(typeId) =>
                  patchSettings({ defaults: { ...draft.settings.defaults, typeId } })
                }
                variant="field"
              />
              <span className="text-small text-fg-muted">{ti("prop.priority")}</span>
              <PriorityPicker
                value={draft.settings.defaults.priority}
                onChange={(priority) =>
                  patchSettings({ defaults: { ...draft.settings.defaults, priority } })
                }
                variant="field"
              />
              <span className="text-small text-fg-muted">{ti("prop.labels")}</span>
              <LabelPicker
                meta={meta}
                value={draft.settings.defaults.labelIds}
                onChange={(labelIds) =>
                  patchSettings({ defaults: { ...draft.settings.defaults, labelIds } })
                }
                variant="field"
              />
              <span className="text-small text-fg-muted">{t("notify")}</span>
              <AssigneePicker
                meta={meta}
                value={draft.settings.notifyUserIds}
                onChange={(notifyUserIds) => patchSettings({ notifyUserIds })}
                variant="field"
              />
            </div>
            <FieldHint>{t("notifyHint")}</FieldHint>
          </Section>

          <Section title={t("protection")} description={t("protectionHint")}>
            <label className="flex items-center justify-between gap-3">
              <span className="flex flex-col">
                <span className="text-body font-medium">{t("turnstile")}</span>
                <FieldHint>
                  {turnstileAvailable ? t("turnstileHint") : t("turnstileMissing")}
                </FieldHint>
              </span>
              <Switch
                checked={draft.settings.turnstileEnabled}
                disabled={!turnstileAvailable}
                onCheckedChange={(turnstileEnabled) => patchSettings({ turnstileEnabled })}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fb-maxsize">{t("maxFileSize")}</Label>
                <Input
                  id="fb-maxsize"
                  type="number"
                  min={1}
                  max={25}
                  value={draft.settings.maxFileSizeMb}
                  onChange={(e) => patchSettings({ maxFileSizeMb: Number(e.target.value) || 1 })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fb-maxfiles">{t("maxFiles")}</Label>
                <Input
                  id="fb-maxfiles"
                  type="number"
                  min={1}
                  max={10}
                  value={draft.settings.maxFiles}
                  onChange={(e) => patchSettings({ maxFiles: Number(e.target.value) || 1 })}
                />
              </div>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-body font-medium">{t("fileTypes")}</legend>
              {MIME_GROUPS.map((g) => {
                const types: readonly string[] = MIME_PRESETS[g];
                const current = draft.settings.allowedMimeTypes.length
                  ? draft.settings.allowedMimeTypes
                  : DEFAULT_MIME_TYPES;
                const on = types.every((m) => current.includes(m));
                return (
                  <label key={g} className="flex items-center gap-2 text-body">
                    <Checkbox
                      checked={on}
                      onCheckedChange={(c) => {
                        const next = c
                          ? [...new Set([...current, ...types])]
                          : current.filter((m) => !types.includes(m));
                        const all =
                          DEFAULT_MIME_TYPES.every((m) => next.includes(m)) &&
                          next.length === DEFAULT_MIME_TYPES.length;
                        patchSettings({ allowedMimeTypes: all ? [] : next });
                      }}
                    />
                    {t(`mime.${g}`)}
                  </label>
                );
              })}
            </fieldset>
          </Section>

          <Section title={t("embedding")} description={t("embeddingHint")}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fb-origins">{t("allowedOrigins")}</Label>
              <Textarea
                id="fb-origins"
                rows={3}
                value={draft.settings.allowedEmbedOrigins.join("\n")}
                placeholder="https://vtk.be"
                aria-invalid={errors.settings ? true : undefined}
                onChange={(e) =>
                  patchSettings({
                    allowedEmbedOrigins: e.target.value
                      .split(/\s+/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
              <FieldHint>{t("allowedOriginsHint")}</FieldHint>
            </div>
          </Section>

          <Section title={t("danger")} description={t("deleteHint")}>
            <Button
              variant="danger-ghost"
              className="self-start"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash />
              {t("delete")}
            </Button>
          </Section>
        </div>

        <div
          className="hidden min-h-0 flex-1 overflow-y-auto bg-canvas p-6 lg:block"
          aria-label={t("preview")}
        >
          <p className="mb-3 text-caption font-medium text-fg-muted">{t("preview")}</p>
          <div className="flex justify-center">
            <PublicForm form={preview} mode="preview" />
          </div>
        </div>
      </div>

      <EmbedDialog
        open={embedOpen}
        onOpenChange={setEmbedOpen}
        appOrigin={appOrigin}
        slug={draft.slug}
        title={draft.title}
        theme={draft.theme}
        onTheme={(theme) => patch({ theme })}
        dirty={dirty}
      />
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent size="sm" closeLabel={t("cancel")}>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const res = await deleteFormAction(ws, form.id);
                if (res.ok) router.push(`${base}/forms` as never);
                else toast.error(t("errors.generic"));
              }}
            >
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Settings sections stacked in one column (the preview takes the right side). */
function Section(props: React.ComponentProps<typeof SettingsSection>) {
  return <SettingsSection {...props} className="md:grid-cols-1 md:gap-3 md:px-6" />;
}

function FieldCard({
  field: f,
  index,
  count,
  open,
  onToggle,
  onChange,
  onMove,
  onRemove,
  takenTargets,
  derived,
}: {
  field: FormField;
  index: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  onChange: (p: Partial<FormField>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  takenTargets: Set<FormFieldTarget>;
  derived: FieldOption[] | null;
}) {
  const t = useTranslations("forms");
  const id = `field-${f.key}`;
  const hasOptions = f.type === "SELECT" || f.type === "MULTI_SELECT";
  return (
    <li
      className={cn(
        "rounded-card border bg-surface",
        open ? "border-border-strong shadow-card" : "border-border",
      )}
      data-testid="field-card"
    >
      <div className="flex h-11 items-center gap-2 pr-1.5 pl-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={id}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] text-left focus-ring"
        >
          <span className="text-icon [&_svg]:size-4">{TYPE_ICON[f.type]}</span>
          <span className="min-w-0 truncate text-body font-medium text-fg">{f.label}</span>
          {f.required ? (
            <span className="text-caption text-danger-text">{t("requiredShort")}</span>
          ) : null}
          {f.target !== "NONE" ? (
            <span className="rounded-[6px] border border-sky-200 bg-sky-50 px-1.5 text-caption font-medium text-sky-800">
              → {t(`target.${f.target}`)}
            </span>
          ) : null}
        </button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("moveUp")}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("moveDown")}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("removeField")}
          disabled={count === 1}
          onClick={onRemove}
        >
          <Trash />
        </Button>
      </div>
      {open ? (
        <div id={id} className="grid gap-3 border-t border-border px-3 py-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-label`}>{t("label")}</Label>
            <Input
              id={`${id}-label`}
              value={f.label}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-type`}>{t("fieldType")}</Label>
            <select
              id={`${id}-type`}
              className={cn(inputClasses, "appearance-auto")}
              value={f.type}
              onChange={(e) => onChange({ type: e.target.value as FormFieldType })}
            >
              {FIELD_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`type.${ty}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-target`}>{t("mapsTo")}</Label>
            <select
              id={`${id}-target`}
              className={cn(inputClasses, "appearance-auto")}
              value={f.target}
              onChange={(e) => onChange({ target: e.target.value as FormFieldTarget })}
            >
              {targetsByType[f.type].map((target) => (
                <option
                  key={target}
                  value={target}
                  disabled={target !== "NONE" && takenTargets.has(target)}
                >
                  {t(`target.${target}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-help`}>{t("helpText")}</Label>
            <Input
              id={`${id}-help`}
              value={f.helpText ?? ""}
              onChange={(e) => onChange({ helpText: e.target.value || null })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-placeholder`}>{t("placeholder")}</Label>
            <Input
              id={`${id}-placeholder`}
              value={f.placeholder ?? ""}
              disabled={f.type === "CHECKBOX" || f.type === "FILE" || f.type === "MULTI_SELECT"}
              onChange={(e) => onChange({ placeholder: e.target.value || null })}
            />
          </div>
          <label className="flex items-center gap-2 text-body sm:col-span-2">
            <Switch checked={f.required} onCheckedChange={(required) => onChange({ required })} />
            {t("required")}
          </label>
          {hasOptions ? (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-body font-medium">{t("options")}</span>
              {derived ? (
                <FieldHint>{t("optionsDerived", { count: derived.length })}</FieldHint>
              ) : (
                <OptionsEditor options={f.options} onChange={(options) => onChange({ options })} />
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: FieldOption[];
  onChange: (o: FieldOption[]) => void;
}) {
  const t = useTranslations("forms");
  const valueFor = (label: string, i: number) =>
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || `option_${i + 1}`;
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={o.label}
            aria-label={t("optionN", { n: i + 1 })}
            onChange={(e) =>
              onChange(
                options.map((x, j) =>
                  j === i ? { label: e.target.value, value: valueFor(e.target.value, j) } : x,
                ),
              )
            }
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("removeOption")}
            disabled={options.length === 1}
            onClick={() => onChange(options.filter((_, j) => j !== i))}
          >
            <Trash />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() =>
          onChange([
            ...options,
            {
              value: `option_${options.length + 1}`,
              label: t("optionN", { n: options.length + 1 }),
            },
          ])
        }
      >
        <Plus />
        {t("addOption")}
      </Button>
    </div>
  );
}

function EmbedDialog({
  open,
  onOpenChange,
  appOrigin,
  slug,
  title,
  theme,
  onTheme,
  dirty,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  appOrigin: string;
  slug: string;
  title: string;
  theme: FormTheme;
  onTheme: (t: FormTheme) => void;
  dirty: boolean;
}) {
  const t = useTranslations("forms");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const iframe = `<iframe src="${appOrigin}/f/${slug}?embed=1" title="${esc(title)}" style="width:100%;height:720px;border:0" loading="lazy"></iframe>`;
  const script = `<script src="${appOrigin}/embed.js" data-form="${slug}" data-text="${esc(theme.buttonText)}" data-position="${theme.position}" async></script>`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" closeLabel={t("cancel")}>
        <DialogHeader>
          <DialogTitle>{t("embed")}</DialogTitle>
          <DialogDescription>{t("embedHint")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          {dirty ? <Banner tone="warning" title={t("embedUnsaved")} /> : null}
          <Snippet
            label={t("snippetScript")}
            hint={t("snippetScriptHint")}
            code={script}
            testId="snippet-script"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="embed-text">{t("buttonText")}</Label>
              <Input
                id="embed-text"
                value={theme.buttonText}
                onChange={(e) => onTheme({ ...theme, buttonText: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-body font-medium">{t("buttonPosition")}</span>
              <SegmentedControl
                value={theme.position}
                onValueChange={(position) =>
                  onTheme({ ...theme, position: position as FormTheme["position"] })
                }
                label={t("buttonPosition")}
                className="self-start"
              >
                <SegmentedControlItem value="bottom-right">{t("bottomRight")}</SegmentedControlItem>
                <SegmentedControlItem value="bottom-left">{t("bottomLeft")}</SegmentedControlItem>
              </SegmentedControl>
            </div>
          </div>
          <Snippet
            label={t("snippetIframe")}
            hint={t("snippetIframeHint")}
            code={iframe}
            testId="snippet-iframe"
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            {t("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Snippet({
  label,
  hint,
  code,
  testId,
}: {
  label: string;
  hint: string;
  code: string;
  testId: string;
}) {
  const t = useTranslations("forms");
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-body font-medium">{label}</span>
        <Button
          variant="ghost"
          size="xs"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            toast(t("copied"));
          }}
        >
          {t("copy")}
        </Button>
      </div>
      <pre
        className="overflow-x-auto rounded-control border border-border bg-surface-muted p-3 font-mono text-small break-all whitespace-pre-wrap text-fg-secondary"
        data-testid={testId}
      >
        {code}
      </pre>
      <FieldHint>{hint}</FieldHint>
    </div>
  );
}
