import { Suspense } from "react";
import { getNotificationPreferences } from "@/server/queries/inbox";
import { requireWorkspaceCtx } from "@/server/session";
import { RowsSkeleton } from "@/components/shell/page-skeletons";
import { NotificationSettings } from "./notification-settings";

export const metadata = { title: "Notifications" };

export default function NotificationsPage({ params }: PageProps<"/[ws]/settings/notifications">) {
  return (
    <Suspense fallback={<RowsSkeleton rows={8} />}>
      <Notifications params={params} />
    </Suspense>
  );
}

async function Notifications({
  params,
}: {
  params: PageProps<"/[ws]/settings/notifications">["params"];
}) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const prefs = await getNotificationPreferences(ctx);
  return <NotificationSettings ws={ws} initial={prefs} guest={ctx.role === "GUEST"} />;
}
