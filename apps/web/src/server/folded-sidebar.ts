import "server-only";
import { cookies } from "next/headers";
import { FOLDED_COOKIE, parseFolded, type SidebarArea } from "@/lib/folded-sidebar";

/** Whether this browser folded the page's secondary column (D-137). Dynamic: call under Suspense. */
export async function sidebarFolded(area: SidebarArea): Promise<boolean> {
  return parseFolded((await cookies()).get(FOLDED_COOKIE)?.value).has(area);
}
