import Image from "next/image";
import { cn } from "@/lib/cn";

export function DoplMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/dopl-mark-192.png"
      alt=""
      width={size}
      height={size}
      priority
      className={cn("shrink-0 select-none", className)}
    />
  );
}

export function DoplLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <DoplMark size={26} />
      <span className="text-title-lg font-bold tracking-[-0.02em] text-fg">Dopl</span>
    </span>
  );
}
