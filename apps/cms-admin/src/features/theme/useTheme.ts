import { createContext, useContext } from 'react';

import type { ResolvedTheme, ThemeChoice } from './theme';

export interface ThemeContextValue {
  /** What the user picked: Light, Dark or System (the default). */
  choice: ThemeChoice;
  /** What is applied now; for System this follows the OS setting live. */
  resolved: ResolvedTheme;
  /** Applies and persists a new choice. */
  setChoice: (choice: ThemeChoice) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

/** The current theme choice and a setter. Must be used under `ThemeProvider`. */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}
