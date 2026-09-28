import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium",
    "transition-[background-color,border-color,color,box-shadow] duration-[var(--dur-fast)] ease-out",
    "disabled:pointer-events-none disabled:opacity-50 focus-ring",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active [&_svg]:text-on-primary/80",
        secondary:
          "border border-border-strong bg-surface text-fg shadow-xs hover:bg-surface-hover active:bg-neutral-150 [&_svg]:text-icon",
        ghost: "text-fg-secondary hover:bg-neutral-150 hover:text-fg active:bg-neutral-200 [&_svg]:text-icon",
        danger: "bg-danger text-white hover:bg-danger-hover [&_svg]:text-white/85",
        "danger-ghost": "text-danger-text hover:bg-danger-bg",
        link: "h-auto px-0 text-link underline-offset-4 hover:underline",
      },
      size: {
        lg: "h-10 rounded-control px-4 text-nav [&_svg]:size-[18px]",
        md: "h-9 rounded-control px-3 text-body [&_svg]:size-4",
        sm: "h-8 rounded-[9px] px-2.5 text-body [&_svg]:size-4",
        xs: "h-7 rounded-chip px-2 text-small [&_svg]:size-3.5",
        "icon-lg": "size-10 rounded-control [&_svg]:size-[18px]",
        icon: "size-9 rounded-control [&_svg]:size-4",
        "icon-sm": "size-8 rounded-[9px] [&_svg]:size-4",
        "icon-xs": "size-7 rounded-chip [&_svg]:size-3.5",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span className="invisible inline-flex items-center gap-1.5">{children}</span>
          <span className="absolute inset-0 inline-flex items-center justify-center">
            <Spinner />
          </span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
}
