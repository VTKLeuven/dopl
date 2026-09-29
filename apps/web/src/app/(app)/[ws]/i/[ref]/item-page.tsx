"use client";

import { ItemDetail } from "@/features/work-items/item-detail";

export function ItemPage({ ws, itemRef }: { ws: string; itemRef: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="item-page">
      <ItemDetail ws={ws} itemRef={itemRef} mode="page" />
    </div>
  );
}
