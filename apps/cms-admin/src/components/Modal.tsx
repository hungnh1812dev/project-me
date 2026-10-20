import { type ReactNode, useEffect, useId, useRef } from 'react';

/**
 * Modal dialog on the native `<dialog>` (`showModal`): the browser traps
 * focus, makes the page behind inert and closes on Esc, which calls
 * `onClose`. Mount it to open, unmount to close.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Esc, or the caller's own cancel button. */
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      onCancel={(event) => {
        // Let React state decide: the dialog closes when it unmounts.
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-foreground/40"
    >
      <div className="grid gap-4 p-5">
        <div className="grid gap-1.5">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description === undefined ? null : (
            <div id={descriptionId} className="text-sm text-muted-foreground">
              {description}
            </div>
          )}
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Dialog buttons: secondary left, primary right, aligned to the end (T03). */
export function ModalActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {children}
    </div>
  );
}
