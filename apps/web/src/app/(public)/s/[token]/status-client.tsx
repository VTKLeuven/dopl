"use client";

import { useRouter } from "next/navigation";
import type { PublicRequestView } from "@/server/queries/intake";
import { RequestThread } from "@/features/intake/request-thread";

export function StatusPageClient({ token, view }: { token: string; view: PublicRequestView }) {
  const router = useRouter();
  const base = `/api/public/status/${encodeURIComponent(token)}`;
  return (
    <div className="rounded-panel border border-border bg-surface p-7 shadow-card">
      <RequestThread
        view={view}
        fileHref={(id) => `${base}/files/${id}`}
        onUpload={async (file) => {
          const body = new FormData();
          body.set("file", file);
          const res = await fetch(`${base}/uploads`, { method: "POST", body });
          const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
          return res.ok && json.id ? { id: json.id } : { error: json.error ?? "upload_failed" };
        }}
        onReply={async (text, attachmentIds) => {
          const res = await fetch(`${base}/replies`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ body: text, attachmentIds }),
          });
          if (!res.ok) {
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            return { ok: false, error: json.error ?? "server_error" };
          }
          router.refresh();
          return { ok: true };
        }}
      />
    </div>
  );
}
