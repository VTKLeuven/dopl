import { cn } from "@/lib/cn";

/** Placeholder that matches the final element's size exactly (no layout shift). */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn("h-4 skeleton", className)} {...props} />;
}
