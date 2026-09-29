"use client";

import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  size = "md",
  children,
  hideClose,
  closeLabel = "Close",
  ...props
}: React.ComponentProps<typeof D.Content> & {
  size?: "sm" | "md" | "lg" | "xl";
  hideClose?: boolean;
  closeLabel?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-[50] bg-neutral-900/25 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <D.Content
        className={cn(
          "fixed top-[12vh] left-1/2 z-[50] flex max-h-[76vh] w-[calc(100vw-32px)] -translate-x-1/2 flex-col",
          "rounded-panel border border-border bg-surface text-fg shadow-dialog outline-none",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2 data-[state=open]:zoom-in-[0.98]",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98]",
          size === "sm" && "max-w-[420px]",
          size === "md" && "max-w-[560px]",
          size === "lg" && "max-w-[720px]",
          size === "xl" && "max-w-[1040px]",
          className,
        )}
        {...props}
      >
        {children}
        {hideClose ? null : (
          <D.Close asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-3"
              aria-label={closeLabel}
            >
              <X />
            </Button>
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 px-5 pt-5 pr-12 pb-2", className)} {...props} />;
}
export function DialogTitle({ className, ...props }: React.ComponentProps<typeof D.Title>) {
  return <D.Title className={cn("text-title font-semibold", className)} {...props} />;
}
export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof D.Description>) {
  return <D.Description className={cn("text-body text-fg-muted", className)} {...props} />;
}
export function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-3", className)} {...props} />;
}
export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
