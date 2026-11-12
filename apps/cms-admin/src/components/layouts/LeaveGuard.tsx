import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { ConfirmDialog } from '@components/ConfirmDialog';
import { COMMON_TEXT } from '@configs/locales';
import { useNavigate } from 'react-router';

interface LeaveGuardContextValue {
  /** Registers one page with unsaved work; returns the function that withdraws it. */
  register: () => () => void;
  isGuarded: () => boolean;
  confirmLeave: () => Promise<boolean>;
}

const NO_GUARD: LeaveGuardContextValue = {
  register: () => () => undefined,
  isGuarded: () => false,
  confirmLeave: () => Promise.resolve(true),
};

const LeaveGuardContext = createContext<LeaveGuardContextValue>(NO_GUARD);

interface PendingLeave {
  resolve: (isConfirmed: boolean) => void;
  opener: HTMLElement | null;
}

/**
 * Lets a page with unsaved work stop the shell's own links (menu, user menu,
 * app name) until the user confirms. The browser back and forward buttons are
 * not guarded: `BrowserRouter` offers no blocker.
 */
export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const guardCount = useRef(0);
  const [pending, setPending] = useState<PendingLeave | null>(null);
  const pendingRef = useRef<PendingLeave | null>(null);
  const text = COMMON_TEXT.common.leaveDialog;

  const settle = useCallback((isConfirmed: boolean) => {
    pendingRef.current?.resolve(isConfirmed);
    setPending(null);
  }, []);

  const value = useMemo<LeaveGuardContextValue>(
    () => ({
      register: () => {
        guardCount.current += 1;
        return () => {
          guardCount.current -= 1;
        };
      },
      isGuarded: () => guardCount.current > 0,
      confirmLeave: () => {
        if (guardCount.current === 0) return Promise.resolve(true);
        // A second ask while the dialog is open keeps the user on the page.
        pendingRef.current?.resolve(false);
        const opener =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        return new Promise<boolean>((resolve) => {
          const next = { resolve, opener };
          pendingRef.current = next;
          setPending(next);
        });
      },
    }),
    [],
  );

  return (
    <LeaveGuardContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={pending !== null}
        title={text.title}
        description={text.description}
        cancelLabel={text.stay}
        confirmLabel={text.leave}
        confirmVariant="warning"
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
        onCloseFocus={() => pendingRef.current?.opener?.focus()}
      />
    </LeaveGuardContext.Provider>
  );
}

/** A page calls this with whether it holds unsaved work; while true, closing the tab asks too. */
export function useLeaveGuard(shouldConfirm: boolean) {
  const { register } = useContext(LeaveGuardContext);
  useEffect(() => {
    if (!shouldConfirm) return undefined;
    const withdraw = register();
    const askBrowser = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', askBrowser);
    return () => {
      window.removeEventListener('beforeunload', askBrowser);
      withdraw();
    };
  }, [register, shouldConfirm]);
}

/** Resolves `true` at once when no page registered; otherwise opens the leave dialog and resolves with the choice. */
export function useConfirmLeave(): () => Promise<boolean> {
  return useContext(LeaveGuardContext).confirmLeave;
}

/**
 * Click handler for a shell link. With no registered page it does nothing
 * but run `afterLeaving`, so the link behaves as before; with one it holds the
 * navigation until the user confirms.
 */
export function useGuardedLinkClick() {
  const { isGuarded, confirmLeave } = useContext(LeaveGuardContext);
  const navigate = useNavigate();
  return useCallback(
    (event: MouseEvent<HTMLElement>, to: string, afterLeaving?: () => void) => {
      const opensElsewhere = event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0;
      if (!isGuarded() || opensElsewhere) {
        afterLeaving?.();
        return;
      }
      event.preventDefault();
      void confirmLeave().then((isConfirmed) => {
        if (!isConfirmed) return;
        void navigate(to);
        afterLeaving?.();
      });
    },
    [confirmLeave, isGuarded, navigate],
  );
}
