import { Skeleton } from "@/components/ui/skeleton";

export function PageHeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div
      className="flex h-[var(--header-height)] shrink-0 items-center gap-3 border-b border-border px-4 md:px-5"
      aria-hidden
    >
      <Skeleton className="size-[18px] rounded-[5px]" />
      <Skeleton className="h-3.5 w-40" />
      <div className="ml-auto flex gap-2">
        {Array.from({ length: actions }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-control" />
        ))}
      </div>
    </div>
  );
}

export function RowsSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div aria-hidden className="fade-bottom">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex h-[var(--row-height)] items-center gap-3 border-b border-border px-5"
        >
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3.5" style={{ width: `${30 + ((i * 37) % 35)}%` }} />
          <Skeleton className="ml-auto h-6 w-20 rounded-chip" />
          <Skeleton className="size-6 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <>
      <PageHeaderSkeleton />
      <RowsSkeleton />
    </>
  );
}
