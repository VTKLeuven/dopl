import { Suspense } from "react";
import { notFound } from "next/navigation";
import { canWorkspace } from "@dopl/shared/policy";
import { getContact, listContacts } from "@/server/queries/contacts";
import { requireWorkspaceCtx } from "@/server/session";
import { PageSkeleton } from "@/components/shell/page-skeletons";
import { ContactDetailView } from "@/features/intake/contact-detail";

export const metadata = { title: "Contact" };

export default function ContactPage({ params }: PageProps<"/[ws]/contacts/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Contact params={params} />
    </Suspense>
  );
}

async function Contact({ params }: { params: PageProps<"/[ws]/contacts/[id]">["params"] }) {
  const { ws, id } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  if (!canWorkspace(ctx.policyActor, "contact.view")) notFound();
  const contact = await getContact(ctx, id).catch(() => notFound());
  const canMerge = canWorkspace(ctx.policyActor, "contact.merge");
  const others = canMerge ? await listContacts(ctx) : [];
  return (
    <ContactDetailView
      key={contact.id}
      ws={ws}
      contact={contact}
      others={others}
      canMerge={canMerge}
    />
  );
}
