import { useCallback, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';

import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  SYSTEM_DARK_QUERY,
  writeStoredTheme,
  type ThemeChoice,
} from './theme';
import { ThemeContext, type ThemeContextValue } from './useTheme';

const subscribeSystemDark = (onChange: () => void) => {
  const query = window.matchMedia(SYSTEM_DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const getSystemDark = () => window.matchMedia(SYSTEM_DARK_QUERY).matches;

/**
 * Owns the theme after mount (`public/theme-init.js` sets it before first paint).
 * Persists the choice and, in System mode, follows OS changes live.
 */
const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStoredTheme);
  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, () => false);
  const resolved = resolveTheme(choice, systemDark);

  useLayoutEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    writeStoredTheme(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ choice, resolved, setChoice }),
    [choice, resolved, setChoice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
ThemeProvider.displayName = 'ThemeProvider';

export default ThemeProvider;
