import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "~/components/ui/button.js";
import { cn } from "~/lib/utils.js";

export function FilterPanel({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex flex-col border-neutral-800 bg-neutral-950 shadow-xl outline-none",
            "inset-x-0 bottom-0 max-h-[86vh] rounded-t-md border-t",
            "md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:max-h-none md:w-[380px] md:rounded-none md:border-t-0 md:border-l",
          )}
        >
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
            <Dialog.Description className="sr-only">
              Adjust filters, then apply or reset them.
            </Dialog.Description>
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="ghost"
                className="size-9 p-0"
                aria-label="Close filters"
              >
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
          <div className="flex gap-2 border-t border-neutral-800 px-4 py-3">{footer}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
