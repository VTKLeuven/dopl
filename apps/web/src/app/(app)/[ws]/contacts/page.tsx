import { Suspense } from "react";
import { notFound } from "next/navigation";
import { canWorkspace } from "@dopl/shared/policy";
import { listContacts } from "@/server/queries/contacts";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/shell/page-skeletons";
import { ContactsList } from "@/features/intake/contacts-list";

export const metadata = { title: "Contacts" };

export default function ContactsPage({ params }: PageProps<"/[ws]/contacts">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton actions={0} />
          <div className="h-[var(--toolbar-height)] border-b border-border" />
          <RowsSkeleton rows={8} />
        </>
      }
    >
      <Contacts params={params} />
    </Suspense>
  );
}

async function Contacts({ params }: { params: PageProps<"/[ws]/contacts">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  if (!canWorkspace(ctx.policyActor, "contact.view")) notFound();
  return <ContactsList ws={ws} contacts={await listContacts(ctx)} />;
}
