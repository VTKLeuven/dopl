"use client";

import { useEffect, useRef } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { WorkItemDetail } from "@/features/work-items/types";
import { handleNotesEvent } from "@/features/notes/realtime";
import { SharedEventSource } from "./client";
import { commsInvalidations } from "./comms-events";

interface WireEvent {
  topic: string;
  type: string;
  payload: { id?: string } | null;
}

const FLUSH_MS = 150;

/**
 * Keeps every open list, board and detail in sync with changes made elsewhere
 * (other people, other tabs, the agent). Events are batched briefly, then
 * mapped to TanStack Query invalidations; server-rendered pages refresh.
 */
export function RealtimeProvider() {
  const params = useParams<{ ws?: string }>();
  const ws = params.ws;
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  // Read inside the listener; the connection must not restart on navigation.
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!ws || typeof EventSource === "undefined") return;
    // One stream per browser, shared by its tabs (leader tab, D-023).
    const es = new SharedEventSource(ws);
    const comms: QueryKey[] = [];
    const scopes = new Set<string>();
    const items = new Set<string>();
    const metas = new Set<string>();
    const intake = new Set<string>();
    const agentKeys = new Set<string>();
    let refreshPage = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      // A refetch landing while our own change is still saving would overwrite
      // its optimistic update with stale data; wait until local writes settle.
      if (qc.isMutating() > 0) {
        timer = setTimeout(flush, FLUSH_MS);
        return;
      }
      for (const scope of scopes) void qc.invalidateQueries({ queryKey: ["items", scope] });
      for (const scope of scopes) void qc.invalidateQueries({ queryKey: ["relations", scope] });
      if (scopes.size) void qc.invalidateQueries({ queryKey: ["items", "workspace"] });
      invalidateDetails(qc, items);
      for (const m of metas) void qc.invalidateQueries({ queryKey: ["meta", m] });
      for (const p of intake) void qc.invalidateQueries({ queryKey: ["intake", p] });
      if (metas.size) void qc.invalidateQueries({ queryKey: ["meta", "workspace"] });
      for (const key of comms.splice(0)) void qc.invalidateQueries({ queryKey: key });
      for (const key of agentKeys)
        void qc.invalidateQueries({ queryKey: JSON.parse(key) as QueryKey });
      agentKeys.clear();
      if (refreshPage) router.refresh();
      scopes.clear();
      items.clear();
      metas.clear();
      intake.clear();
      refreshPage = false;
    };
    const schedule = () => {
      timer ??= setTimeout(flush, FLUSH_MS);
    };

    es.onmessage = (e: MessageEvent<string>) => {
      let ev: WireEvent;
      try {
        ev = JSON.parse(e.data) as WireEvent;
      } catch {
        return;
      }
      if (handleNotesEvent(qc, ws, ev.type)) return;
      // Shared mailbox (Phase 7): lists and counts, the open thread, the settings page.
      if (ev.topic.startsWith("mailbox:") || ev.topic.startsWith("emailThread:")) {
        const [kind, id] = ev.topic.split(":");
        if (kind === "mailbox") {
          void qc.invalidateQueries({ queryKey: ["mail", ws, "threads"] });
          void qc.invalidateQueries({ queryKey: ["mail", ws, "mailboxes"] });
          // Settings → Mailboxes and a mailbox page, and Settings → My mailbox.
          if (path.current.includes("/settings/mailbox")) router.refresh();
        } else if (id && ev.type !== "presence") {
          void qc.invalidateQueries({ queryKey: ["mail", ws, "thread", id] });
        }
        return;
      }
      // The AI teammate (Phase 8): run cards, the agent page, conversations, settings.
      if (ev.type.startsWith("agent")) {
        const p = (ev.payload ?? {}) as { runId?: string; id?: string };
        const runId = p.runId ?? (ev.type.startsWith("agentRun.") ? p.id : undefined);
        if (runId) agentKeys.add(JSON.stringify(["agent", ws, "run", runId]));
        const [kind, id] = ev.topic.split(":");
        if (kind === "agent") {
          agentKeys.add(JSON.stringify(["agent", ws, "activity"]));
          if (ev.type === "agentSettings.updated" && path.current.includes("/settings/agent"))
            refreshPage = true;
        }
        // Streaming steps only touch their run; runs and approvals also move the item and chat.
        if (!ev.type.startsWith("agentStep.")) {
          if (kind === "workItem" && id) items.add(id);
          if (kind === "channel" && id) agentKeys.add(JSON.stringify(["agent", ws, "channel", id]));
        }
        schedule();
        return;
      }
      // Dashboards (Phase 6): the list and layouts; charts refresh on their own schedule.
      if (ev.type.startsWith("dashboard.")) {
        void qc.invalidateQueries({ queryKey: ["analytics", ws, "dashboards"] });
        void qc.invalidateQueries({ queryKey: ["analytics", ws, "dashboard"] });
        return;
      }
      const [kind, id] = ev.topic.split(":");
      comms.push(...commsInvalidations(ws, ev));
      if (kind === "project" && id) {
        if (ev.type.startsWith("workItem.")) {
          scopes.add(id);
          if (ev.payload?.id) items.add(ev.payload.id);
          // The Home list is server-rendered.
          if (path.current.endsWith("/home")) refreshPage = true;
        } else if (ev.type.startsWith("project.")) {
          metas.add(id);
          scopes.add(id);
        } else if (ev.type.startsWith("view.")) {
          refreshPage = true;
        } else if (ev.type.startsWith("intake.")) {
          // The triage queue, its counts and the sidebar badge.
          intake.add(id);
          refreshPage = true;
        }
      } else if (kind === "workItem" && id) {
        items.add(id);
        // A guest's request page is server-rendered.
        if (/\/requests\//.test(path.current)) refreshPage = true;
      } else if (kind === "workspace") {
        // Projects, members, labels, views: sidebar and settings are server-rendered.
        refreshPage = true;
        void qc.invalidateQueries({ queryKey: ["palette"] });
      }
      schedule();
    };
    es.addEventListener("resync", () => {
      void qc.invalidateQueries();
      router.refresh();
    });

    return () => {
      if (timer) clearTimeout(timer);
      es.close();
    };
  }, [ws, qc, router]);

  return null;
}

function invalidateDetails(qc: QueryClient, ids: Set<string>) {
  if (ids.size === 0) return;
  for (const [key, data] of qc.getQueriesData<WorkItemDetail>({ queryKey: ["item"] })) {
    if (!data) continue;
    if (ids.has(data.id) || data.children.some((c) => ids.has(c.id)))
      void qc.invalidateQueries({ queryKey: key });
  }
}
