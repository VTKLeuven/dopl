"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useTranslations } from "next-intl";
import { CircleCheck, FileUp, Paperclip, X } from "lucide-react";
import type { PublicFormDefinition } from "@dopl/shared/schemas/intake";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError, FieldHint, Input, Label, Textarea, inputClasses } from "@/components/ui/input";
import { DoplMark } from "@/components/icons/dopl-logo";
import { useHydrated } from "@/lib/use-hydrated";

export type FormMode = "page" | "embed" | "modal" | "preview";

type Field = PublicFormDefinition["fields"][number];
type Values = Record<string, unknown>;
interface Upload {
  localId: string;
  id: string | null;
  name: string;
  size: number;
  error: string | null;
}

const newId = () => crypto.randomUUID();

/** The embedding page's origin, as far as the browser tells us (checked again on submit). */
function hostOrigin(param: string | null): string | undefined {
  if (window.parent === window) return undefined;
  const ancestors = (window.location as Location & { ancestorOrigins?: DOMStringList })
    .ancestorOrigins;
  if (ancestors?.length) return ancestors[0] ?? undefined;
  if (param) return param;
  try {
    return document.referrer ? new URL(document.referrer).origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The public intake form (ARCHITECTURE §6). Same component in four places:
 * the hosted page, the iframe embed, the embed.js modal and the builder's
 * live preview (which never submits).
 */
export function PublicForm({
  form,
  mode,
  originParam = null,
}: {
  form: PublicFormDefinition;
  mode: FormMode;
  originParam?: string | null;
}) {
  const t = useTranslations("publicForm");
  const [values, setValues] = useState<Values>({});
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [uploads, setUploads] = useState<Record<string, Upload[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ number: number | null; email: string } | null>(null);
  const session = useRef({ clientSubmissionId: "", startedAt: 0 });
  const root = useRef<HTMLDivElement>(null);
  const preview = mode === "preview";
  // Until React owns the form, a click would be lost (or submit natively).
  const hydrated = useHydrated();
  const embedded = mode === "embed" || mode === "modal";

  useEffect(() => {
    session.current = { clientSubmissionId: newId(), startedAt: Date.now() };
  }, []);

  // Embeds: tell the host page how tall we are so it can size the iframe.
  useEffect(() => {
    if (!embedded || !root.current || window.parent === window) return;
    const el = root.current;
    const post = () =>
      window.parent.postMessage({ type: "dopl:resize", height: el.scrollHeight }, "*");
    const ro = new ResizeObserver(post);
    ro.observe(el);
    post();
    return () => ro.disconnect();
  }, [embedded, done]);

  const set = (key: string, value: unknown) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const upload = async (field: Field, files: FileList | null) => {
    if (!files || preview) return;
    const current = uploads[field.key] ?? [];
    const room = Math.max(0, form.maxFiles - current.length);
    const picked = Array.from(files).slice(0, room);
    const entries: Upload[] = picked.map((f) => ({
      localId: newId(),
      id: null,
      name: f.name,
      size: f.size,
      error:
        f.size > form.maxFileSizeMb * 1024 * 1024
          ? t("fileTooLarge", { mb: form.maxFileSizeMb })
          : null,
    }));
    setUploads((u) => ({ ...u, [field.key]: [...current, ...entries] }));
    await Promise.all(
      picked.map(async (file, i) => {
        const entry = entries[i];
        if (!entry || entry.error) return;
        const body = new FormData();
        body.set("file", file);
        body.set("clientSubmissionId", session.current.clientSubmissionId);
        let patch: Partial<Upload>;
        try {
          const res = await fetch(`/api/public/forms/${form.slug}/uploads`, {
            method: "POST",
            body,
          });
          const json = (await res.json()) as { id?: string; error?: string };
          patch = res.ok && json.id ? { id: json.id } : { error: uploadError(t, json.error, form) };
        } catch {
          patch = { error: t("uploadFailed") };
        }
        setUploads((u) => ({
          ...u,
          [field.key]: (u[field.key] ?? []).map((x) =>
            x.localId === entry.localId ? { ...x, ...patch } : x,
          ),
        }));
      }),
    );
  };

  const validate = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const f of form.fields) {
      const v = values[f.key];
      if (!f.required) continue;
      const empty =
        f.type === "FILE"
          ? !(uploads[f.key] ?? []).some((u) => u.id)
          : f.type === "CHECKBOX"
            ? v !== true
            : Array.isArray(v)
              ? v.length === 0
              : typeof v !== "string" || v.trim() === "";
      if (empty) out[f.key] = t("required");
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) out.email = t("invalidEmail");
    return out;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview || pending) return;
    const found = validate();
    setErrors(found);
    setBanner(null);
    if (Object.keys(found).length) return;
    const stillUploading = Object.values(uploads).some((list) =>
      list.some((u) => !u.id && !u.error),
    );
    if (stillUploading) {
      setBanner(t("waitForUploads"));
      return;
    }
    setPending(true);
    const payload: Values = { ...values };
    for (const f of form.fields)
      if (f.type === "FILE")
        payload[f.key] = (uploads[f.key] ?? []).flatMap((u) => (u.id ? [u.id] : []));
    const turnstileToken =
      (root.current?.querySelector<HTMLInputElement>("[name=cf-turnstile-response]")?.value ||
        undefined) ??
      undefined;
    try {
      const res = await fetch(`/api/public/forms/${form.slug}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientSubmissionId: session.current.clientSubmissionId,
          startedAt: session.current.startedAt,
          email: email.trim(),
          name: name.trim() || undefined,
          values: payload,
          website,
          turnstileToken,
          embedOrigin: embedded ? hostOrigin(originParam) : undefined,
        }),
      });
      const json = (await res.json()) as {
        number?: number | null;
        error?: string;
        fields?: Record<string, string[]>;
      };
      if (res.ok) {
        setDone({ number: json.number ?? null, email: email.trim() });
        return;
      }
      if (res.status === 429) {
        const minutes = Math.ceil(Number(res.headers.get("retry-after") ?? "60") / 60);
        setBanner(t("rateLimited", { minutes }));
      } else if (json.fields) {
        setErrors(Object.fromEntries(Object.keys(json.fields).map((k) => [k, t("checkField")])));
        setBanner(t("fixErrors"));
      } else if (json.error === "embed_not_allowed") setBanner(t("embedNotAllowed"));
      else if (json.error === "turnstile_failed") setBanner(t("turnstileFailed"));
      else if (json.error === "not_found") setBanner(t("closed"));
      else setBanner(t("genericError"));
    } catch {
      setBanner(t("genericError"));
    } finally {
      setPending(false);
    }
  };

  const reset = () => {
    session.current = { clientSubmissionId: newId(), startedAt: Date.now() };
    setValues({});
    setUploads({});
    setErrors({});
    setDone(null);
  };

  return (
    <div
      ref={root}
      className={cn(
        "w-full",
        mode === "page" &&
          "rounded-panel border border-border bg-surface shadow-card sm:max-w-[560px]",
        mode === "modal" && "min-h-full bg-surface",
      )}
      data-testid="public-form"
    >
      <div className={cn("flex flex-col gap-5", embedded ? "p-6" : "p-7")}>
        <header className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-small font-medium text-fg-muted">
            <DoplMark size={18} />
            <span className="truncate">{form.workspaceName}</span>
            {mode === "modal" ? (
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                className="-my-1 ml-auto"
                aria-label={t("close")}
                onClick={() => window.parent.postMessage({ type: "dopl:close" }, "*")}
              >
                <X />
              </Button>
            ) : null}
          </div>
          <h1 className="text-title-lg font-semibold tracking-[-0.012em] text-fg">{form.title}</h1>
          {form.description ? (
            <p className="text-body whitespace-pre-line text-fg-secondary">{form.description}</p>
          ) : null}
        </header>

        {done ? (
          <div
            className="flex flex-col items-start gap-3 py-2"
            role="status"
            data-testid="form-success"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-success-bg text-success">
              <CircleCheck className="size-5" />
            </span>
            <p className="text-title font-semibold">
              {done.number !== null
                ? t("successTitle", { number: done.number })
                : t("successTitleNoNumber")}
            </p>
            <p className="text-body whitespace-pre-line text-fg-secondary">
              {form.successMessage || t("successBody", { email: done.email })}
            </p>
            <Button variant="secondary" onClick={reset}>
              {t("another")}
            </Button>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
            {preview ? <Banner tone="info" title={t("previewNotice")} /> : null}
            {banner ? <Banner tone="warning" title={banner} /> : null}
            {form.fields.map((f) => (
              <FieldInput
                key={f.key}
                field={f}
                value={values[f.key]}
                error={errors[f.key]}
                uploads={uploads[f.key] ?? []}
                onChange={(v) => set(f.key, v)}
                onFiles={(files) => void upload(f, files)}
                onRemoveUpload={(localId) =>
                  setUploads((u) => ({
                    ...u,
                    [f.key]: (u[f.key] ?? []).filter((x) => x.localId !== localId),
                  }))
                }
                accept={form.accept}
                maxFileSizeMb={form.maxFileSizeMb}
              />
            ))}
            <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pf-email">
                  {t("email")}
                  <span className="text-danger-text" aria-hidden>
                    {" "}
                    *
                  </span>
                </Label>
                <Input
                  id="pf-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  aria-invalid={errors.email ? true : undefined}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrors((e) => {
                      const next = { ...e };
                      delete next.email;
                      return next;
                    });
                  }}
                  placeholder={t("emailPlaceholder")}
                />
                {errors.email ? <FieldError>{errors.email}</FieldError> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pf-name">{t("name")}</Label>
                <Input
                  id="pf-name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
            {/* Honeypot: invisible to people, irresistible to bots. */}
            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>
                {t("honeypot")}
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  name="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
            </div>
            {form.turnstileSiteKey && !preview ? (
              <>
                <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
                <div className="cf-turnstile" data-sitekey={form.turnstileSiteKey} />
              </>
            ) : null}
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-caption text-fg-muted">{t("privacy")}</p>
              <Button
                type="submit"
                variant="primary"
                loading={pending}
                disabled={preview || !hydrated}
              >
                {t("submit")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function uploadError(
  t: ReturnType<typeof useTranslations<"publicForm">>,
  code: string | undefined,
  form: PublicFormDefinition,
): string {
  switch (code) {
    case "too_large":
      return t("fileTooLarge", { mb: form.maxFileSizeMb });
    case "type_not_allowed":
      return t("fileType");
    case "too_many_files":
      return t("tooManyFiles", { max: form.maxFiles });
    case "rate_limited":
      return t("rateLimitedShort");
    default:
      return t("uploadFailed");
  }
}

function FieldInput({
  field: f,
  value,
  error,
  uploads,
  onChange,
  onFiles,
  onRemoveUpload,
  accept,
  maxFileSizeMb,
}: {
  field: Field;
  value: unknown;
  error: string | undefined;
  uploads: Upload[];
  onChange: (v: unknown) => void;
  onFiles: (files: FileList | null) => void;
  onRemoveUpload: (localId: string) => void;
  accept: string[];
  maxFileSizeMb: number;
}) {
  const t = useTranslations("publicForm");
  const id = `pf-${f.key}`;
  const str = typeof value === "string" ? value : "";
  const invalid = error ? true : undefined;
  const describedBy =
    [f.helpText ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined;
  const label = (
    <Label htmlFor={f.type === "MULTI_SELECT" || f.type === "FILE" ? undefined : id}>
      {f.label}
      {f.required ? (
        <span className="text-danger-text" aria-hidden>
          {" "}
          *
        </span>
      ) : null}
    </Label>
  );
  let control: React.ReactNode;
  switch (f.type) {
    case "SHORT_TEXT":
    case "EMAIL":
      control = (
        <Input
          id={id}
          type={f.type === "EMAIL" ? "email" : "text"}
          value={str}
          placeholder={f.placeholder ?? undefined}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          required={f.required}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "LONG_TEXT":
      control = (
        <Textarea
          id={id}
          rows={5}
          value={str}
          placeholder={f.placeholder ?? undefined}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          required={f.required}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "DATE":
      control = (
        <Input
          id={id}
          type="date"
          value={str}
          className="w-auto"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          required={f.required}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "SELECT":
      control = (
        <select
          id={id}
          value={str}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          required={f.required}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClasses, "appearance-auto pr-2")}
        >
          <option value="">{f.placeholder || t("choose")}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case "MULTI_SELECT": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      control = (
        <div
          role="group"
          aria-label={f.label}
          aria-describedby={describedBy}
          className="flex flex-col gap-2"
        >
          {f.options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-body text-fg">
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={(c) =>
                  onChange(c ? [...selected, o.value] : selected.filter((v) => v !== o.value))
                }
              />
              {o.label}
            </label>
          ))}
        </div>
      );
      break;
    }
    case "CHECKBOX":
      return (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="flex items-start gap-2.5 text-body text-fg">
            <Checkbox
              id={id}
              className="mt-0.5"
              checked={value === true}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onCheckedChange={(c) => onChange(c === true)}
            />
            <span>
              {f.label}
              {f.required ? (
                <span className="text-danger-text" aria-hidden>
                  {" "}
                  *
                </span>
              ) : null}
              {f.helpText ? (
                <span id={`${id}-help`} className="block text-caption text-fg-muted">
                  {f.helpText}
                </span>
              ) : null}
            </span>
          </label>
          {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
        </div>
      );
    case "FILE":
      control = (
        <div className="flex flex-col gap-2">
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1 rounded-card border border-dashed border-border-strong bg-surface-muted px-4 py-5 text-center",
              "transition-colors focus-within:border-focus hover:border-neutral-300 hover:bg-surface-hover",
              error && "border-danger",
            )}
          >
            <FileUp className="size-5 text-icon" aria-hidden />
            <span className="text-body font-medium text-fg">{t("dropFiles")}</span>
            <span className="text-caption text-fg-muted">
              {t("fileLimits", { mb: maxFileSizeMb })}
            </span>
            <input
              type="file"
              multiple
              accept={accept.join(",")}
              className="sr-only"
              aria-describedby={describedBy}
              onChange={(e) => {
                onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {uploads.length ? (
            <ul className="flex flex-col gap-1.5">
              {uploads.map((u) => (
                <li
                  key={u.localId}
                  className="flex h-9 items-center gap-2 rounded-control border border-border px-2.5 text-small"
                >
                  <Paperclip className="size-3.5 shrink-0 text-icon" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  <span
                    className={cn(
                      "shrink-0 tabular",
                      u.error ? "text-danger-text" : "text-fg-muted",
                    )}
                  >
                    {u.error ?? (u.id ? formatSize(u.size) : t("uploading"))}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("removeFile", { name: u.name })}
                    onClick={() => onRemoveUpload(u.localId)}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
      break;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {label}
      {control}
      {f.helpText ? <FieldHint id={`${id}-help`}>{f.helpText}</FieldHint> : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
