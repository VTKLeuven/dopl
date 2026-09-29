"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText, ImageIcon, Paperclip, Trash } from "lucide-react";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import { deleteAttachmentAction } from "@/server/actions/attachments";
import { Button } from "@/components/ui/button";
import type { WorkItemDetail } from "./types";

const MAX = 25 * 1024 * 1024;
const fmtSize = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(0)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;

export function Attachments({
  ws,
  item,
  canEdit,
  onChanged,
}: {
  ws: string;
  item: WorkItemDetail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("items");
  const relative = useRelativeTime();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);

  async function upload(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (file.size > MAX) {
        toast.error(t("tooLarge", { name: file.name }));
        continue;
      }
      setUploading((u) => [...u, file.name]);
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/v1/${ws}/items/${item.id}/attachments`, {
        method: "POST",
        body,
      });
      setUploading((u) => u.filter((n) => n !== file.name));
      if (!res.ok) toast.error(t("uploadFailed", { name: file.name }));
    }
    onChanged();
  }

  if (item.attachments.length === 0 && !canEdit) return null;
  return (
    <section
      onDragOver={(e) => {
        if (!canEdit || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (canEdit && e.dataTransfer.files.length) void upload(e.dataTransfer.files);
      }}
      className={cn(
        "rounded-card transition-colors",
        dragging && "bg-sky-50 outline-1 outline-sky-300 outline-dashed",
      )}
    >
      <div className="flex h-8 items-center justify-between">
        <h3 className="text-body font-semibold">{t("attachments")}</h3>
        {canEdit ? (
          <>
            <Button variant="ghost" size="xs" onClick={() => input.current?.click()}>
              <Paperclip />
              {t("attach")}
            </Button>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              onChange={(e) => e.target.files && void upload(e.target.files)}
              data-testid="attachment-input"
            />
          </>
        ) : null}
      </div>
      {item.attachments.length || uploading.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {item.attachments.map((a) => (
            <li
              key={a.id}
              className="group flex items-center gap-2.5 rounded-card border border-border px-3 py-2"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-surface-muted text-icon">
                {a.mimeType.startsWith("image/") ? (
                  <ImageIcon className="size-4" />
                ) : (
                  <FileText className="size-4" />
                )}
              </span>
              <a
                href={`/api/v1/${ws}/files/${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1"
              >
                <span className="block truncate text-body font-medium hover:underline">
                  {a.filename}
                </span>
                <span className="block truncate text-small text-fg-muted tabular">
                  {fmtSize(a.size)} · {a.uploadedByName ? `${a.uploadedByName} · ` : ""}
                  {relative(a.createdAt)}
                </span>
              </a>
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("delete")}
                  className="opacity-0 group-hover:opacity-100"
                  onClick={async () => {
                    await deleteAttachmentAction(ws, a.id);
                    onChanged();
                  }}
                >
                  <Trash />
                </Button>
              ) : null}
            </li>
          ))}
          {uploading.map((name) => (
            <li
              key={name}
              className="flex items-center gap-2.5 rounded-card border border-dashed border-border px-3 py-2 text-small text-fg-muted"
            >
              <Paperclip className="size-4 animate-pulse" />
              {t("uploading", { name })}
            </li>
          ))}
        </ul>
      ) : canEdit ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex h-14 w-full items-center justify-center rounded-card border border-dashed border-border-strong text-small text-fg-muted hover:bg-surface-hover"
        >
          {t("dropFiles")}
        </button>
      ) : null}
    </section>
  );
}
