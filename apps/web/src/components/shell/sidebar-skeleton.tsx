import { DoplMark } from "@/components/icons/dopl-logo";
import { Skeleton } from "@/components/ui/skeleton";

/** Same geometry as <Sidebar> so nothing shifts when it streams in. */
export function SidebarSkeleton() {
  return (
    <div className="flex h-full flex-col px-3 pt-4 pb-3" aria-hidden>
      <div className="flex h-8 items-center gap-2 px-1.5">
        <DoplMark size={24} />
        <span className="text-title font-bold tracking-[-0.02em] text-fg">Dopl</span>
      </div>
      <div className="mt-4 h-[38px] rounded-control border border-border-strong bg-surface" />
      <div className="mt-4 flex flex-col gap-0.5">
        {[64, 84].map((w) => (
          <div key={w} className="flex h-9 items-center gap-2.5 px-2.5">
            <Skeleton className="size-[18px] rounded-[5px]" />
            <Skeleton className="h-3" style={{ width: w }} />
          </div>
        ))}
      </div>
      <div className="mt-5 flex h-6 items-center px-2.5">
        <Skeleton className="h-2.5 w-14" />
      </div>
      <div className="mt-1 flex flex-col gap-0.5">
        {[96, 72, 110, 88].map((w) => (
          <div key={w} className="flex h-9 items-center gap-2.5 px-2.5">
            <Skeleton className="size-[18px] rounded-[5px]" />
            <Skeleton className="h-3" style={{ width: w }} />
          </div>
        ))}
      </div>
    </div>
  );
}
