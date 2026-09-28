import { Suspense } from "react";
import { SidebarSkeleton } from "@/components/shell/sidebar-skeleton";
import { CommandPalette } from "@/components/shell/command-palette";
import { SidebarLoader } from "./sidebar-loader";

/**
 * Inset-panel app shell (DESIGN_SYSTEM §4.1): the sidebar sits on the canvas,
 * the page lives in a white panel. The frame is static (prerendered); the
 * session-dependent sidebar streams in behind a same-size skeleton (D-005).
 */
export default function WorkspaceLayout({ children, params }: LayoutProps<"/[ws]">) {
  return (
    <div className="flex h-dvh bg-canvas">
      <aside className="hidden w-[var(--sidebar-width)] shrink-0 md:block">
        <Suspense fallback={<SidebarSkeleton />}>
          <SidebarLoader params={params} />
        </Suspense>
      </aside>
      <main
        id="main"
        className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface md:my-[var(--panel-inset)] md:mr-[var(--panel-inset)] md:rounded-panel md:border md:border-border"
      >
        {children}
      </main>
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
    </div>
  );
}
