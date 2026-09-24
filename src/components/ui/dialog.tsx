"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Fenêtre modale. Sur mobile elle s'affiche comme un panneau remontant du bas de l'écran.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <RadixDialog.Content
          className={cn(
            "fixed z-50 flex max-h-[92dvh] flex-col border border-border bg-surface shadow-2xl focus:outline-none",
            "inset-x-0 bottom-0 rounded-t-2xl",
            "sm:inset-auto sm:top-[12vh] sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:rounded-2xl",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-5">
            <div>
              <RadixDialog.Title className="text-base font-semibold">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-0.5 text-sm text-muted">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label="Fermer">
              <X size={18} />
            </RadixDialog.Close>
          </div>
          <div className="overflow-y-auto px-5 pt-4 pb-5">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
