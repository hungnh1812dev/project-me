import { readStorage, writeStorage } from './storage';

/** Whether the desktop side menu is expanded (`true`) or collapsed to the icon rail (AC-28). */
export const SIDEBAR_OPEN_KEY = 'cms-admin:sidebar:open';

/** Whether one side-menu group (`content`, `settings`) is open (AC-29). */
export const sidebarGroupKey = (group: string): string => `cms-admin:sidebar:group:${group}`;

/** The stored boolean, or `fallback` when nothing valid is stored or storage is blocked. */
export function readFlag(key: string, fallback: boolean): boolean {
  const value = readStorage(key);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

/** Stores a boolean. Never throws (see `writeStorage`). */
export function writeFlag(key: string, value: boolean): void {
  writeStorage(key, String(value));
}
