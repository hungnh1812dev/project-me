# Theme

Light, dark or system colour scheme for the admin. A pre-paint script applies the stored choice
before React mounts so there is no flash, and `ThemeProvider` takes over afterwards and follows OS
changes live. Users pick a theme in the header's account menu.

## Feature

- **Choices:** Light, Dark or System (default). Stored in `localStorage['cms-admin:theme']`
  (`THEME_STORAGE_KEY`); a missing, invalid or unreadable value means System.
- **Logic:** `resolveTheme(stored, systemDark)`: an explicit light or dark wins, else the OS
  setting (`SYSTEM_DARK_QUERY`). `applyTheme(resolved)` toggles `.dark` and sets `color-scheme` on
  `<html>`. `readStoredTheme`/`writeStoredTheme` go through `readStorage`/`writeStorage` from the
  [App shell](./app-shell.md) storage module (try/catch, in-memory fallback).
- **Pre-paint:** `public/theme-init.js` is an external ES5 script that `index.html` loads before the
  module script and that applies the same rule. It is external, not inline, because the CSP has no
  `'unsafe-inline'` (see [CSP and headers](./csp-and-headers.md)).
- **Runtime:** `ThemeProvider` (inside `AppProvider`) owns the choice after mount and listens to the
  OS media query while the choice is System. `useTheme()` returns `{ choice, resolved, setChoice }`.

### Decisions

- **One rule, two implementations, one test.** The pre-paint script can't import TS, so a unit test
  runs `theme-init.js` in jsdom against the `resolveTheme` truth table; they cannot drift.
- **System is the default**, so a new user gets their OS setting.

## Files

| File                               | Spec                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/features/theme/theme.ts`      | Exports `resolveTheme`, `readStoredTheme`, `writeStoredTheme`, `applyTheme`, `isThemeChoice`, `THEME_STORAGE_KEY`, `DEFAULT_THEME_CHOICE`, `SYSTEM_DARK_QUERY`, `ThemeChoice`, `ResolvedTheme`. Pure theme rules. |
| `src/features/theme/ThemeProvider.tsx` | Default export `ThemeProvider`: holds the choice, applies it, follows OS changes.            |
| `src/features/theme/useTheme.ts`   | Exports `useTheme`, `ThemeContext`, `ThemeContextValue`.                                          |
| `public/theme-init.js`             | Pre-paint ES5 script; same rule as `resolveTheme`.                                                |

## Testing

- `src/features/theme/theme.test.ts`: the truth table and storage edge cases.
- `src/features/theme/themeInit.test.ts`: runs `theme-init.js` in jsdom against the same table.
- `src/features/theme/ThemeProvider.test.tsx`: choice changes and live OS changes.
- `e2e/theme.spec.ts`: title, a stored dark choice before mount (no flash), System before and after
  mount, light over a dark OS, blocked `localStorage`, no font CDN requests.
- Run: `pnpm --filter cms-admin exec vitest run src/features/theme` and
  `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/theme.spec.ts`.

## Related

- [Design system](./design-system.md) (tokens for `:root` and `.dark`)
- [App shell](./app-shell.md) (account menu Theme radio group, storage helpers)
- [CSP and headers](./csp-and-headers.md)
