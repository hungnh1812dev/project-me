import { readStorage, writeStorage } from '@/features/shell/storage';

/** The user's choice. `system` follows the OS setting. */
export type ThemeChoice = 'light' | 'dark' | 'system';
/** The theme that is actually applied. */
export type ResolvedTheme = 'light' | 'dark';

/** Keep in sync with `public/theme-init.js`, which runs before React mounts. */
export const THEME_STORAGE_KEY = 'cms-admin:theme';
export const DEFAULT_THEME_CHOICE: ThemeChoice = 'system';
export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** An explicit light or dark choice wins; anything else (system, missing, invalid) follows the OS. */
export function resolveTheme(
  stored: string | null | undefined,
  systemDark: boolean,
): ResolvedTheme {
  if (stored === 'light' || stored === 'dark') return stored;
  return systemDark ? 'dark' : 'light';
}

/** The stored choice, or `system` when it is missing, invalid or storage is unavailable. */
export function readStoredTheme(): ThemeChoice {
  const stored = readStorage(THEME_STORAGE_KEY);
  return isThemeChoice(stored) ? stored : DEFAULT_THEME_CHOICE;
}

export function writeStoredTheme(choice: ThemeChoice): void {
  writeStorage(THEME_STORAGE_KEY, choice);
}

/** Toggles `.dark` and the native `color-scheme` on the root element. */
export function applyTheme(
  resolved: ResolvedTheme,
  root: HTMLElement = document.documentElement,
): void {
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}
