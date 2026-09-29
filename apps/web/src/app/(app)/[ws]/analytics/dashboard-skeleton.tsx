import { Skeleton } from "@/components/ui/skeleton";
import { PLOT_HEIGHT } from "@/features/analytics/chart";

/** The dashboard's frame while it loads: the filter row and cards the charts' size. */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy>
      <Skeleton className="h-8 w-80 rounded-control" />
      <div className="grid grid-cols-12 gap-4">
        {[4, 4, 4, 8, 4].map((w, i) => (
          <div
            key={i}
            className={
              w === 8
                ? "col-span-12 flex flex-col gap-3 rounded-card border border-border p-4 xl:col-span-8"
                : "col-span-12 flex flex-col gap-3 rounded-card border border-border p-4 md:col-span-6 xl:col-span-4"
            }
          >
            <Skeleton className="h-4 w-32" />
            {i < 3 ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <Skeleton className="w-full" style={{ height: PLOT_HEIGHT }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
