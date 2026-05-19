"use client";

// Modal — an accessible dialog built on Radix's dialog primitive:
// focus-trap, scroll-lock, Escape-to-close, overlay-click-to-close,
// and proper aria wiring all come for free. Styled to the Upper
// surface. Controlled via `open` / `onOpenChange`.
//
// Entrance animation is CSS (see globals.css upper-modal-* keyframes);
// the dialog closes instantly when its owner stops rendering it.
import * as Dialog from "@radix-ui/react-dialog";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="upper-modal-overlay fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm" />
        <Dialog.Content className="upper-modal-content fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-lg outline-none">
          <Dialog.Title className="pr-8 text-xl font-bold tracking-tight text-ink">
            {title}
          </Dialog.Title>
          {description && (
            <Dialog.Description className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              {description}
            </Dialog.Description>
          )}
          <Dialog.Close
            aria-label="Close"
            className="absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none text-ink-faint outline-none transition hover:bg-cream hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            ×
          </Dialog.Close>
          <div className="mt-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
