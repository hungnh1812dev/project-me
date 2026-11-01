import { useCallback, useState } from 'react';
import { NAV_GROUP_OPEN_STORAGE_KEY } from '@configs/NavSections.constants';

type OpenState = Record<string, boolean>;

function readStoredState(): OpenState {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(NAV_GROUP_OPEN_STORAGE_KEY) ?? '{}',
    );
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as OpenState)
      : {};
  } catch {
    // Unreadable storage: every group stays open.
    return {};
  }
}

function writeStoredState(state: OpenState): void {
  try {
    window.localStorage.setItem(NAV_GROUP_OPEN_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Not remembered this time; the in-memory state still works.
  }
}

/** Which collapsible menu groups are open, kept per browser; groups are open until closed. */
export function useNavGroupOpenState() {
  const [state, setState] = useState<OpenState>(readStoredState);

  const isOpen = useCallback((groupId: string) => state[groupId] !== false, [state]);

  const toggle = useCallback((groupId: string) => {
    setState((current) => {
      const next = { ...current, [groupId]: current[groupId] === false };
      writeStoredState(next);
      return next;
    });
  }, []);

  return { isOpen, toggle };
}
