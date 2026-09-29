import { cn } from "@/lib/cn";

export const inputClasses = cn(
  "flex h-9 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 text-body text-fg shadow-xs",
  "placeholder:text-fg-placeholder",
  "transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-out",
  "outline-none focus-visible:border-focus focus-visible:ring-[3px] focus-visible:ring-sky-400/30",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/20",
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-disabled",
  "read-only:bg-surface-muted",
);

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn(inputClasses, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(inputClasses, "h-auto min-h-20 resize-y py-2 leading-[22px]", className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label className={cn("text-body font-medium text-fg select-none", className)} {...props} />
  );
}

export function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-caption font-normal text-fg-muted", className)} {...props} />;
}

export function FieldError({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      role="alert"
      className={cn("text-caption font-medium text-danger-text", className)}
      {...props}
    />
  );
}
