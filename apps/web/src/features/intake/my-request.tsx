"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { textToDoc } from "@dopl/shared/rich-text";
import type { PublicRequestView } from "@/server/queries/intake";
import { replyToRequestAction } from "@/server/actions/intake";
import { PageHeader } from "@/components/shell/page-header";
import { RequestThread } from "./request-thread";

export function MyRequest({ ws, view }: { ws: string; view: PublicRequestView }) {
  const t = useTranslations("requests");
  const router = useRouter();
  return (
    <>
      <PageHeader
        crumbs={[
          { label: t("title"), icon: <Send />, href: `/${ws}/requests` },
          { label: t("number", { number: view.number }) },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-6 py-8">
          <RequestThread
            view={view}
            fileHref={(id) => `/api/v1/${ws}/files/${id}`}
            onReply={async (text) => {
              const res = await replyToRequestAction(ws, { id: view.id, body: textToDoc(text) });
              if (!res.ok) return { ok: false, error: res.error };
              router.refresh();
              return { ok: true };
            }}
          />
        </div>
      </div>
    </>
  );
}
