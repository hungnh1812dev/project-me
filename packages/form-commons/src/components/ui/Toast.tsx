import * as React from 'react';
import { cn } from 'cn';
import { CircleCheck, CircleX, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';

import { CONTROL_FOCUS_RING_ONLY_CLASSES } from './Control.constants';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  tone: ToastTone;
  title: string;
  description?: string;
  /** A toast shown with the same key is replaced instead of stacked. */
  key?: string;
}

export interface ToastLabels {
  /** Accessible name of the notification region. */
  region: string;
  /** Accessible name of the close button. */
  close: string;
}

const MAX_VISIBLE_TOASTS = 3;
/** Longest exit animation (`--duration-base` in the premium theme) before a closed toast is dropped. */
const EXIT_REMOVAL_DELAY_MS = 300;

const TOAST_TONES: Record<
  ToastTone,
  { icon: LucideIcon; iconClassName: string; durationMs: number; type: 'foreground' | 'background' }
> = {
  success: {
    icon: CircleCheck,
    iconClassName: 'text-success-strong',
    durationMs: 4000,
    type: 'background',
  },
  info: { icon: Info, iconClassName: 'text-info-strong', durationMs: 4000, type: 'background' },
  warning: {
    icon: TriangleAlert,
    iconClassName: 'text-warning-strong',
    durationMs: 5000,
    type: 'foreground',
  },
  error: {
    icon: CircleX,
    iconClassName: 'text-destructive-strong',
    durationMs: 5000,
    type: 'foreground',
  },
};

interface ToastEntry extends Omit<ToastOptions, 'key'> {
  id: number;
  key?: string;
  isOpen: boolean;
}

const ToastContext = React.createContext<{ showToast: (options: ToastOptions) => void } | null>(
  null,
);

/** Mount once near the app root; renders the viewport (top right from `sm`, top centre below). */
function ToastProvider({ labels, children }: { labels: ToastLabels; children: React.ReactNode }) {
  const [entries, setEntries] = React.useState<ToastEntry[]>([]);
  const nextIdRef = React.useRef(0);

  const closeEntry = React.useCallback((id: number) => {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, isOpen: false } : entry)),
    );
  }, []);

  const removeEntry = React.useCallback((id: number) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const showToast = React.useCallback((options: ToastOptions) => {
    nextIdRef.current += 1;
    const created: ToastEntry = { ...options, id: nextIdRef.current, isOpen: true };
    setEntries((current) => {
      const kept = current.filter(
        (entry) => options.key === undefined || entry.key !== options.key,
      );
      const openEntries = [created, ...kept.filter((entry) => entry.isOpen)];
      const evictedIds = new Set(openEntries.slice(MAX_VISIBLE_TOASTS).map((entry) => entry.id));
      return [created, ...kept].map((entry) =>
        evictedIds.has(entry.id) ? { ...entry, isOpen: false } : entry,
      );
    });
  }, []);

  const contextValue = React.useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      <ToastPrimitive.Provider label={labels.region}>
        {children}
        {entries.map((entry) => (
          <ToastItem
            key={entry.id}
            entry={entry}
            closeLabel={labels.close}
            onClose={closeEntry}
            onExited={removeEntry}
          />
        ))}
        <ToastPrimitive.Viewport
          label={`${labels.region} ({hotkey})`}
          data-slot="toast-viewport"
          className="fixed top-20 left-1/2 z-[100] m-0 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 list-none flex-col-reverse gap-2 p-0 outline-none sm:right-4 sm:left-auto sm:translate-x-0"
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

/**
 * Radix keeps a toast on top of the Escape layer stack whenever it re-renders, so
 * while a toast is shown it would swallow Escape meant for an open dialog. The
 * toast then leaves itself open and closes the dialog through its cancel button.
 */
function closeOpenDialog(): boolean {
  const dialogs = document.querySelectorAll('[role="dialog"]');
  const topDialog = dialogs[dialogs.length - 1];
  if (!topDialog) return false;
  topDialog.querySelector<HTMLElement>('[data-slot="dialog-close"]')?.click();
  return true;
}

function ToastItem({
  entry,
  closeLabel,
  onClose,
  onExited,
}: {
  entry: ToastEntry;
  closeLabel: string;
  onClose: (id: number) => void;
  onExited: (id: number) => void;
}) {
  const { id, isOpen } = entry;
  const tone = TOAST_TONES[entry.tone];
  const Icon = tone.icon;

  React.useEffect(() => {
    if (isOpen) return undefined;
    const timer = window.setTimeout(() => onExited(id), EXIT_REMOVAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [id, isOpen, onExited]);

  return (
    <ToastPrimitive.Root
      data-slot="toast"
      data-tone={entry.tone}
      type={tone.type}
      duration={tone.durationMs}
      open={isOpen}
      onEscapeKeyDown={(event) => {
        if (closeOpenDialog()) event.preventDefault();
      }}
      onOpenChange={(open) => {
        if (!open) onClose(id);
      }}
      className="border-border bg-card/90 text-card-foreground rounded-surface shadow-overlay data-[state=open]:animate-toast-in data-[state=closed]:animate-toast-out relative flex items-start gap-3 border p-4 pr-10 backdrop-blur-md motion-reduce:animate-none"
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', tone.iconClassName)} />
      <div className="grid min-w-0 gap-1">
        <ToastPrimitive.Title className="m-0 text-sm font-medium">
          {entry.title}
        </ToastPrimitive.Title>
        {entry.description ? (
          <ToastPrimitive.Description className="text-muted-foreground m-0 text-sm">
            {entry.description}
          </ToastPrimitive.Description>
        ) : null}
      </div>
      <ToastPrimitive.Close
        aria-label={closeLabel}
        className={cn(
          'text-muted-foreground hover:text-foreground rounded-control absolute top-3 right-3 inline-flex size-6 items-center justify-center outline-none',
          CONTROL_FOCUS_RING_ONLY_CLASSES,
        )}
      >
        <X aria-hidden="true" className="size-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

export { ToastProvider, useToast };
