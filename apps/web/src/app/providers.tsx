"use client";

import { useEffect } from "react";
import { QueryClient, QueryClientProvider, isServer, useIsMutating } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Server data is hydrated on first load and kept fresh by realtime
        // events, so avoid refetch storms on mount.
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

/** Optimistic UI means the screen is ahead of the server: warn before leaving mid-save. */
function UnsavedChangesGuard() {
  const pending = useIsMutating();
  useEffect(() => {
    if (pending === 0) return;
    // <html data-saving> while writes are in flight: tests wait on it instead
    // of guessing from network activity (the realtime stream never idles).
    document.documentElement.dataset.saving = "true";
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      delete document.documentElement.dataset.saving;
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [pending]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <UnsavedChangesGuard />
      <NuqsAdapter>
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  );
}
