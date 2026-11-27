import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ITEM_UID_KEY } from './Content.constants';
import type { RefusedItem } from './Content.errors';
import type { FormValues } from './Document.form';

type OpenKeys = ReadonlySet<string>;

/** Form path of an item that has no `componentUid` yet, by its client key (`experience.2`, `experience.0.skills.1`). */
type NewItemPaths = ReadonlyMap<string, string>;

function uidAtPath(values: FormValues, path: string): string {
  let node: unknown = values;
  for (const step of path.split('.')) {
    if (node === null || typeof node !== 'object') return '';
    node = (node as Record<string, unknown>)[step];
  }
  const uid = (node as FormValues | undefined)?.[ITEM_UID_KEY];
  return typeof uid === 'string' ? uid : '';
}

/**
 * After a write, open items that had no `componentUid` take the uid found at
 * the same position in the refetched draft; an item not found there is closed.
 */
export function rekeyOpenItems(
  openKeys: OpenKeys,
  newItemPaths: NewItemPaths,
  draftValues: FormValues,
): OpenKeys {
  const next = new Set(openKeys);
  for (const [clientKey, path] of newItemPaths) {
    if (!next.delete(clientKey)) continue;
    const uid = uidAtPath(draftValues, path);
    if (uid !== '') next.add(uid);
  }
  return next;
}

/** Form path of each item along a refused chain (`experience.1`, `experience.1.roles.0`). */
function chainPaths(chain: readonly RefusedItem[]): string[] {
  const paths: string[] = [];
  let prefix = '';
  for (const { componentName, index } of chain) {
    prefix = `${prefix}${componentName}.${index}`;
    paths.push(prefix);
    prefix += '.';
  }
  return paths;
}

interface ItemOpenStateValue {
  openKeys: OpenKeys;
  toggle: (itemKey: string) => void;
  open: (itemKey: string) => void;
  close: (itemKey: string) => void;
  /** Opens every item of a refused chain; an item without a uid is found by the path its list tracked. */
  openChain: (chain: readonly RefusedItem[], values: FormValues) => void;
  /** Lists record where each item without a uid stands, for the re-key after a write. */
  trackNewItem: (itemKey: string, path: string) => void;
  untrackNewItem: (itemKey: string) => void;
  /** Call when a write succeeds, before the form is rebuilt from the new draft. */
  rememberNewOpenItems: () => void;
  /** Call once the new draft loaded; `draftValues` are its form values. */
  rekeyRememberedItems: (draftValues: FormValues) => void;
  reset: () => void;
}

const ItemOpenStateContext = createContext<ItemOpenStateValue | null>(null);

/** The open items of every repeatable component on one document page (CE-6); lives above the form. */
export function ItemOpenStateProvider({ children }: { children: ReactNode }) {
  const [openKeys, setOpenKeys] = useState<OpenKeys>(() => new Set());
  const tracked = useRef(new Map<string, string>());
  const remembered = useRef<NewItemPaths>(new Map());
  const openKeysRef = useRef(openKeys);
  useEffect(() => {
    openKeysRef.current = openKeys;
  }, [openKeys]);

  const open = useCallback((itemKey: string) => {
    setOpenKeys((current) => (current.has(itemKey) ? current : new Set(current).add(itemKey)));
  }, []);
  const close = useCallback((itemKey: string) => {
    setOpenKeys((current) => {
      if (!current.has(itemKey)) return current;
      const next = new Set(current);
      next.delete(itemKey);
      return next;
    });
  }, []);
  const toggle = useCallback((itemKey: string) => {
    setOpenKeys((current) => {
      const next = new Set(current);
      if (!next.delete(itemKey)) next.add(itemKey);
      return next;
    });
  }, []);
  const openChain = useCallback(
    (chain: readonly RefusedItem[], values: FormValues) => {
      for (const path of chainPaths(chain)) {
        const uid = uidAtPath(values, path);
        if (uid !== '') {
          open(uid);
          continue;
        }
        for (const [clientKey, trackedPath] of tracked.current) {
          if (trackedPath === path) open(clientKey);
        }
      }
    },
    [open],
  );
  const trackNewItem = useCallback((itemKey: string, path: string) => {
    tracked.current.set(itemKey, path);
  }, []);
  const untrackNewItem = useCallback((itemKey: string) => {
    tracked.current.delete(itemKey);
  }, []);
  const rememberNewOpenItems = useCallback(() => {
    remembered.current = new Map(
      [...tracked.current].filter(([itemKey]) => openKeysRef.current.has(itemKey)),
    );
  }, []);
  const rekeyRememberedItems = useCallback((draftValues: FormValues) => {
    const paths = remembered.current;
    remembered.current = new Map();
    setOpenKeys((current) => rekeyOpenItems(current, paths, draftValues));
  }, []);
  const reset = useCallback(() => {
    remembered.current = new Map();
    setOpenKeys(new Set());
  }, []);

  const value = useMemo<ItemOpenStateValue>(
    () => ({
      openKeys,
      toggle,
      open,
      close,
      openChain,
      trackNewItem,
      untrackNewItem,
      rememberNewOpenItems,
      rekeyRememberedItems,
      reset,
    }),
    [
      openKeys,
      toggle,
      open,
      close,
      openChain,
      trackNewItem,
      untrackNewItem,
      rememberNewOpenItems,
      rekeyRememberedItems,
      reset,
    ],
  );
  return <ItemOpenStateContext.Provider value={value}>{children}</ItemOpenStateContext.Provider>;
}

/** The page-level controls: re-key after a write, reset on another document, list-level tracking. */
export function useItemOpenControls(): ItemOpenStateValue {
  const value = useContext(ItemOpenStateContext);
  if (value === null) throw new Error('useItemOpenControls needs an ItemOpenStateProvider');
  return value;
}

/** Open state of one item: `itemKey` is its `componentUid`, or its client key while it has none. */
export function useItemOpenState(itemKey: string) {
  const { openKeys, toggle, open } = useItemOpenControls();
  return {
    isOpen: openKeys.has(itemKey),
    toggle: () => toggle(itemKey),
    open: () => open(itemKey),
  };
}
