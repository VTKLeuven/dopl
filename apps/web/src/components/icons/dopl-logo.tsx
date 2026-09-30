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

const wordmarks = {
  /** The sidebar header (D-134): fills its 44 px row. */
  sidebar: { mark: 36, text: "text-wordmark gap-2" },
  /** Sign-in and invite pages. */
  auth: { mark: 28, text: "text-title-lg gap-2" },
} as const;

/** The mark and "Dopl" set in the brand face (Outfit). */
export function DoplWordmark({
  size = "auth",
  className,
}: {
  size?: keyof typeof wordmarks;
  className?: string;
}) {
  const w = wordmarks[size];
  return (
    <span className={cn("inline-flex items-center", w.text, className)}>
      <DoplMark size={w.mark} />
      <span className="font-brand font-semibold text-fg">Dopl</span>
    </span>
  );
}

export function DoplLogo({ className }: { className?: string }) {
  return <DoplWordmark size="auth" className={className} />;
}
