import { api } from "@/server/api";
import { listMailboxes } from "@/server/queries/mail";

/** Mailboxes the reader may open, with Unassigned / Mine / Open counts. */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/mail/mailboxes">) {
  const { ws } = await params;
  return api(ws, listMailboxes);
}
