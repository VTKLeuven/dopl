"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Hash } from "lucide-react";
import { isUnderTag, normalizeTagPath } from "@dopl/shared/domain/notes";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/input";
import { Picker } from "@/features/work-items/pickers";
import { useTagActions } from "./data";
import type { TagRow } from "./types";

export interface TagDialogState {
  mode: "rename" | "merge" | "delete";
  tag: TagRow;
  /** Notes using the tag or its sub-tags (from the tree). */
  total: number;
}

/**
 * Rename, merge and delete rewrite the #tag token in the notes' text, so each
 * is confirmed first with the number of notes it touches.
 */
export function TagDialog({
  ws,
  state,
  tags,
  onClose,
}: {
  ws: string;
  state: TagDialogState | null;
  tags: TagRow[];
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(state)} onOpenChange={(o) => !o && onClose()}>
      {state ? (
        <TagForm
          key={`${state.mode}:${state.tag.id}`}
          ws={ws}
          state={state}
          tags={tags}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function TagForm({
  ws,
  state,
  tags,
  onClose,
}: {
  ws: string;
  state: TagDialogState;
  tags: TagRow[];
  onClose: () => void;
}) {
  const t = useTranslations("notes.tags");
  const { rename, remove } = useTagActions(ws);
  const [path, setPath] = useState(state.mode === "rename" ? state.tag.path : "");
  const from = state.tag.path;
  const target = normalizeTagPath(path);
  const exists = target ? tags.some((x) => x.path === target && x.id !== state.tag.id) : false;
  const invalid =
    state.mode !== "delete" && path.trim() !== "" && (!target || isUnderTag(target, from));
  const unchanged = target === from;
  const busy = rename.isPending || remove.isPending;

  const submit = () => {
    if (state.mode === "delete") {
      remove.mutate({ tagId: state.tag.id }, { onSuccess: onClose });
      return;
    }
    if (!target || invalid || unchanged) return;
    rename.mutate({ tagId: state.tag.id, path: target }, { onSuccess: onClose });
  };

  const title =
    state.mode === "rename"
      ? t("renameTitle")
      : state.mode === "merge"
        ? t("mergeTitle")
        : t("deleteTitle");
  const others = tags.filter((x) => !isUnderTag(x.path, from));

  return (
    <DialogContent size="sm" data-testid="tag-dialog">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {state.mode === "delete"
            ? t("deleteDescription", { path: from, count: state.total })
            : t("rewriteDescription", { path: from, count: state.total })}
        </DialogDescription>
      </DialogHeader>
      {state.mode !== "delete" ? (
        <DialogBody className="flex flex-col gap-1.5">
          {state.mode === "rename" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-fg-secondary">{t("newPath")}</span>
              <div className="relative">
                <Hash className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-icon" />
                <Input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  aria-invalid={invalid || undefined}
                  className="pl-9"
                  autoFocus
                />
              </div>
            </label>
          ) : (
            <Picker
              placeholder={t("mergePlaceholder")}
              options={others.map((x) => ({
                value: x.path,
                label: `#${x.path}`,
                icon: <Hash className="size-3.5 text-icon" />,
              }))}
              selected={target ? [target] : []}
              onChange={([v]) => setPath(v ?? "")}
              trigger={
                <Button variant="secondary" className="justify-start">
                  <Hash />
                  <span className="truncate">{target ?? t("mergePlaceholder")}</span>
                </Button>
              }
            />
          )}
          {invalid ? <FieldError>{t("invalid")}</FieldError> : null}
          {!invalid && exists && state.mode === "rename" ? (
            <p className="text-caption text-fg-muted">{t("willMerge", { path: target ?? "" })}</p>
          ) : null}
        </DialogBody>
      ) : null}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          variant={state.mode === "delete" ? "danger" : "primary"}
          onClick={submit}
          loading={busy}
          disabled={state.mode !== "delete" && (!target || invalid || unchanged)}
        >
          {state.mode === "rename"
            ? t("renameSubmit")
            : state.mode === "merge"
              ? t("mergeSubmit")
              : t("deleteSubmit")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
