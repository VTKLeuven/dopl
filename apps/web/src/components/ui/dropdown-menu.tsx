"use client";

import { DropdownMenu as M, ContextMenu as CM } from "radix-ui";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Shortcut } from "./kbd";

export const menuContentClasses = cn(
  "z-[40] min-w-[200px] overflow-hidden rounded-card border border-border bg-surface p-1 text-body text-fg shadow-popover",
  "origin-[var(--radix-dropdown-menu-content-transform-origin)]",
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]",
  "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
);
export const menuItemClasses = cn(
  "relative flex h-8 cursor-default items-center gap-2 rounded-[8px] px-2 outline-none select-none",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-neutral-150",
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-icon",
);

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuGroup = M.Group;
export const DropdownMenuSub = M.Sub;
export const DropdownMenuRadioGroup = M.RadioGroup;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "start",
  ...props
}: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(menuContentClasses, className)}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownMenuItem({
  className,
  shortcut,
  destructive,
  children,
  ...props
}: React.ComponentProps<typeof M.Item> & { shortcut?: string; destructive?: boolean }) {
  return (
    <M.Item
      className={cn(
        menuItemClasses,
        destructive && "text-danger-text data-[highlighted]:bg-danger-bg [&_svg]:text-danger-text",
        className,
      )}
      {...props}
    >
      {children}
      {shortcut ? <Shortcut keys={shortcut} className="ml-auto pl-4" /> : null}
    </M.Item>
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem className={cn(menuItemClasses, "pr-8", className)} {...props}>
      {children}
      <M.ItemIndicator className="absolute right-2 inline-flex">
        <Check className="text-sky-600!" />
      </M.ItemIndicator>
    </M.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn(menuItemClasses, "pr-8", className)} {...props}>
      {children}
      <M.ItemIndicator className="absolute right-2 inline-flex">
        <Check className="text-sky-600!" />
      </M.ItemIndicator>
    </M.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return (
    <M.Label
      className={cn("px-2 pt-2 pb-1 text-caption font-medium text-fg-muted", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof M.SubTrigger>) {
  return (
    <M.SubTrigger
      className={cn(menuItemClasses, "data-[state=open]:bg-neutral-150", className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" />
    </M.SubTrigger>
  );
}

export function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent sideOffset={4} className={cn(menuContentClasses, className)} {...props} />
    </M.Portal>
  );
}

/* Context menu shares the same look (right-click on rows and cards). */
export const ContextMenu = CM.Root;
export const ContextMenuTrigger = CM.Trigger;
export function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof CM.Content>) {
  return (
    <CM.Portal>
      <CM.Content className={cn(menuContentClasses, className)} {...props} />
    </CM.Portal>
  );
}
export function ContextMenuItem({
  className,
  shortcut,
  destructive,
  children,
  ...props
}: React.ComponentProps<typeof CM.Item> & { shortcut?: string; destructive?: boolean }) {
  return (
    <CM.Item
      className={cn(
        menuItemClasses,
        destructive && "text-danger-text data-[highlighted]:bg-danger-bg [&_svg]:text-danger-text",
        className,
      )}
      {...props}
    >
      {children}
      {shortcut ? <Shortcut keys={shortcut} className="ml-auto pl-4" /> : null}
    </CM.Item>
  );
}
export function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CM.Separator>) {
  return <CM.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}
