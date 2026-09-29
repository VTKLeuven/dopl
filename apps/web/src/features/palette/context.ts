"use client";

import { useSyncExternalStore } from "react";

/**
 * The work item ⌘K acts on: the one open in peek or on its page, else the
 * focused row. Views publish it; the palette reads it.
 */
export interface PaletteItem {
  id: string;
  identifier: string;
  title: string;
}

let current: PaletteItem | null = null;
const listeners = new Set<() => void>();

export function setPaletteItem(item: PaletteItem | null) {
  if (current?.id === item?.id && current?.title === item?.title) return;
  current = item;
  for (const l of listeners) l();
}

/** Clears the context only if it still points at this item. */
export function clearPaletteItem(id: string) {
  if (current?.id === id) setPaletteItem(null);
}

export function usePaletteItem(): PaletteItem | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
}

/** "New item" from ⌘K opens the create dialog of the items view on screen, if any. */
let createHandler: (() => void) | null = null;
export function setCreateHandler(fn: (() => void) | null) {
  createHandler = fn;
}
export function getCreateHandler() {
  return createHandler;
}
