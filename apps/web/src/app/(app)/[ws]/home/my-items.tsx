"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import type { Priority, StateGroup } from "@dopl/shared/schemas/work-item";
import { cn } from "@/lib/cn";
import { StateIcon } from "@/components/icons/state-icon";
import { PriorityIcon } from "@/components/icons/priority-icon";
import { ProjectBadge } from "@/components/shell/project-badge";

export interface MyItem {
  id: string;
  identifier: string;
  title: string;
  priority: Priority;
  dueDate: string | null;
  stateGroup: StateGroup;
  stateColor: string;
  stateName: string;
  project: { identifier: string; name: string; color: string | null };
  bucket: "overdue" | "thisWeek" | "later" | "noDue";
}

const BUCKETS = ["overdue", "thisWeek", "later", "noDue"] as const;

export function MyItems({ ws, items }: { ws: string; items: MyItem[] }) {
  const t = useTranslations("home");
  return (
    <div className="flex flex-col gap-6">
      {BUCKETS.map((b) => {
        const list = items.filter((i) => i.bucket === b);
        if (list.length === 0) return null;
        return (
          <section key={b}>
            <h3
              className={cn(
                "mb-2 flex items-center gap-2 text-small font-semibold text-fg-secondary",
                b === "overdue" && "text-danger-text",
              )}
            >
              {t(b)}
              <span className="text-small font-normal text-fg-muted tabular">{list.length}</span>
            </h3>
            <ul className="overflow-hidden rounded-card border border-border">
              {list.map((i) => (
                <li key={i.id} className="border-b border-border last:border-0">
                  <Link
                    href={`/${ws}/p/${i.project.identifier}/items?peek=${i.identifier}` as never}
                    className="flex h-[var(--row-height)] items-center gap-2.5 px-4 focus-ring hover:bg-surface-hover"
                  >
                    <PriorityIcon priority={i.priority} />
                    <span className="w-[76px] shrink-0 text-small font-medium text-fg-muted tabular">
                      {i.identifier}
                    </span>
                    <StateIcon group={i.stateGroup} color={i.stateColor} label={i.stateName} />
                    <span className="min-w-0 flex-1 truncate text-body font-medium">{i.title}</span>
                    <span className="hidden items-center gap-1.5 text-small text-fg-muted sm:inline-flex">
                      <ProjectBadge name={i.project.name} color={i.project.color} size={16} />
                      {i.project.name}
                    </span>
                    {i.dueDate ? (
                      <span
                        className={cn(
                          "inline-flex h-6 items-center gap-1 rounded-[7px] border border-border px-1.5 text-small text-fg-secondary tabular",
                          b === "overdue" && "border-danger-border text-danger-text",
                        )}
                      >
                        <CalendarDays className="size-3.5" />
                        {format(parseISO(i.dueDate), "d MMM")}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
