"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, Lock, LockOpen, MoreHorizontal, Pencil, Star, Trash } from "lucide-react";
import type { FilterGroup } from "@dopl/shared/schemas/filters";
import type { DisplayOptions } from "@dopl/shared/schemas/view";
import type { ViewDetail } from "@/server/queries/views";
import { deleteViewAction, setViewFavoriteAction, updateViewAction } from "@/server/actions/views";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SaveViewDialog } from "./save-view-dialog";

export function FavoriteButton({
  ws,
  viewId,
  initial,
}: {
  ws: string;
  viewId: string;
  initial: boolean;
}) {
  const t = useTranslations("views");
  const [on, setOn] = useState(initial);
  return (
    <Tooltip content={on ? t("unfavorite") : t("favorite")}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-pressed={on}
        aria-label={on ? t("unfavorite") : t("favorite")}
        data-testid="view-favorite"
        onClick={async () => {
          setOn(!on);
          const res = await setViewFavoriteAction(ws, viewId, !on);
          if (!res.ok) setOn(on);
        }}
      >
        <Star className={cn(on && "fill-amber-400 text-amber-500")} />
      </Button>
    </Tooltip>
  );
}

/** "⋯" menu on a view: edit details, duplicate, lock, delete. */
export function ViewMenu({
  ws,
  view,
  projectIdentifier,
  filters,
  options,
}: {
  ws: string;
  view: ViewDetail;
  projectIdentifier: string | null;
  filters: FilterGroup;
  options: DisplayOptions;
}) {
  const t = useTranslations("views");
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "duplicate" | null>(null);
  const listHref = projectIdentifier ? `/${ws}/p/${projectIdentifier}/views` : `/${ws}/views`;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("menu")} data-testid="view-menu">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {view.can.edit ? (
            <DropdownMenuItem onSelect={() => setDialog("edit")}>
              <Pencil />
              {t("editDetails")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setDialog("duplicate")}>
            <Copy />
            {t("duplicate")}
          </DropdownMenuItem>
          {view.can.lock ? (
            <DropdownMenuItem
              onSelect={async () => {
                const res = await updateViewAction(ws, { id: view.id, isLocked: !view.isLocked });
                if (res.ok) toast.success(view.isLocked ? t("unlocked") : t("locked"));
              }}
            >
              {view.isLocked ? <LockOpen /> : <Lock />}
              {view.isLocked ? t("unlock") : t("lock")}
            </DropdownMenuItem>
          ) : null}
          {view.can.delete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-danger-text"
                onSelect={async () => {
                  const res = await deleteViewAction(ws, view.id);
                  if (res.ok) {
                    toast.success(t("deleted", { name: view.name }));
                    router.push(listHref as never);
                  }
                }}
              >
                <Trash />
                {t("delete")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog ? (
        <SaveViewDialog
          ws={ws}
          projectId={view.projectId}
          projectIdentifier={projectIdentifier}
          filters={filters}
          options={options}
          existing={
            dialog === "edit"
              ? {
                  id: view.id,
                  name: view.name,
                  description: view.description,
                  visibility: view.visibility,
                  canShare: view.can.lock,
                }
              : undefined
          }
          open
          onOpenChange={(o) => !o && setDialog(null)}
        />
      ) : null}
    </>
  );
}

/**
 * Filter-bar actions. On a saved view with unsaved changes: reset, save,
 * save as new. On an unsaved view: save as a new view.
 */
export function ViewStateActions({
  ws,
  view,
  modified,
  projectId,
  projectIdentifier,
  filters,
  options,
  onReset,
}: {
  ws: string;
  view: ViewDetail | null;
  modified: boolean;
  projectId: string | null;
  projectIdentifier: string | null;
  filters: FilterGroup;
  options: DisplayOptions;
  onReset: () => void;
}) {
  const t = useTranslations("views");
  const [saving, startSaving] = useTransition();
  const [creating, setCreating] = useState(false);
  if (view && !modified) return null;
  return (
    <>
      {view ? (
        <>
          <Button variant="ghost" size="xs" onClick={onReset} data-testid="view-reset">
            {t("reset")}
          </Button>
          {view.can.edit ? (
            <Button
              size="xs"
              variant="primary"
              loading={saving}
              data-testid="view-save"
              onClick={() =>
                startSaving(async () => {
                  const res = await updateViewAction(ws, {
                    id: view.id,
                    filters,
                    displayOptions: options,
                  });
                  if (res.ok) toast.success(t("saved"));
                  else toast.error(t("saveFailed"));
                })
              }
            >
              {t("save")}
            </Button>
          ) : null}
          <Button size="xs" onClick={() => setCreating(true)}>
            {t("saveAsNew")}
          </Button>
        </>
      ) : (
        <Button size="xs" onClick={() => setCreating(true)} data-testid="save-view">
          {t("saveView")}
        </Button>
      )}
      {creating ? (
        <SaveViewDialog
          ws={ws}
          projectId={projectId}
          projectIdentifier={projectIdentifier}
          filters={filters}
          options={options}
          open
          onOpenChange={(o) => !o && setCreating(false)}
        />
      ) : null}
    </>
  );
}
