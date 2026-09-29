"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False on the server and during hydration, true afterwards. For UI fed by
 * a query cache that a page may hydrate before or after this component
 * (sidebar badges), so server and first client render always agree.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
