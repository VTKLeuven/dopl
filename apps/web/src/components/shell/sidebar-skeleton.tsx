import { Skeleton } from "@/components/ui/skeleton";
import { SidebarBrand } from "./sidebar";

/** Same geometry as <Sidebar> so nothing shifts when it streams in. */
export function SidebarSkeleton() {
  return (
    <div className="flex h-full flex-col px-3 pt-3 pb-3" aria-hidden>
      <SidebarBrand />
      <div className="mt-3 h-8 rounded-control border border-border-strong bg-surface" />
      <div className="mt-3 flex flex-col gap-0.5">
        {[64, 84].map((w) => (
          <div key={w} className="flex h-7 items-center gap-2.5 px-2.5">
            <Skeleton className="size-4 rounded-[5px]" />
            <Skeleton className="h-3" style={{ width: w }} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex h-6 items-center px-2.5">
        <Skeleton className="h-2.5 w-14" />
      </div>
      <div className="mt-0.5 flex flex-col gap-0.5">
        {[96, 72, 110, 88].map((w) => (
          <div key={w} className="flex h-7 items-center gap-2.5 px-2.5">
            <Skeleton className="size-4 rounded-[5px]" />
            <Skeleton className="h-3" style={{ width: w }} />
          </div>
        ))}
      </div>
    </div>
  );
}
