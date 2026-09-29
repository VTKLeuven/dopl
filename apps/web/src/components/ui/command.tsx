"use client";

import { Command as C } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Shortcut } from "./kbd";

/** cmdk list styled for pickers (PropertyPill) and the ⌘K palette. */
export function Command({ className, ...props }: React.ComponentProps<typeof C>) {
  return (
    <C className={cn("flex flex-col overflow-hidden text-body text-fg", className)} {...props} />
  );
}

export function CommandInput({ className, ...props }: React.ComponentProps<typeof C.Input>) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3">
      <Search className="size-4 shrink-0 text-icon" aria-hidden />
      <C.Input
        className={cn(
          "h-10 w-full bg-transparent text-body outline-none placeholder:text-fg-placeholder",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: React.ComponentProps<typeof C.List>) {
  return (
    <C.List
      className={cn("max-h-80 scrollbar-thin overflow-y-auto overscroll-contain p-1", className)}
      {...props}
    />
  );
}

export function CommandEmpty({ className, ...props }: React.ComponentProps<typeof C.Empty>) {
  return (
    <C.Empty
      className={cn("px-3 py-6 text-center text-body text-fg-muted", className)}
      {...props}
    />
  );
}

export function CommandGroup({ className, ...props }: React.ComponentProps<typeof C.Group>) {
  return (
    <C.Group
      className={cn(
        "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function CommandItem({
  className,
  shortcut,
  children,
  ...props
}: React.ComponentProps<typeof C.Item> & { shortcut?: string }) {
  return (
    <C.Item
      className={cn(
        "relative flex h-8 cursor-default items-center gap-2 rounded-[8px] px-2 outline-none select-none",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-neutral-150",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      {shortcut ? <Shortcut keys={shortcut} className="ml-auto pl-3" /> : null}
    </C.Item>
  );
}

export function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof C.Separator>) {
  return <C.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}
