/*
 * Applies the theme before React mounts, so the page never flashes the wrong theme (AC-18).
 * Loaded by index.html as an external script (no inline script, for the future CSP).
 * ES5 on purpose. Mirrors resolveTheme() in src/features/theme/theme.ts; keep both in sync.
 */
/* oxlint-disable no-unused-vars -- ES5 has no optional catch binding. */
(function () {
  var stored = null;
  try {
    stored = window.localStorage.getItem('cms-admin:theme');
  } catch (_error) {
    stored = null;
  }

  var systemDark = false;
  try {
    systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (_error) {
    systemDark = false;
  }

  var dark = stored === 'dark' || (stored !== 'light' && systemDark);
  var root = document.documentElement;
  if (dark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  root.style.colorScheme = dark ? 'dark' : 'light';
})();
