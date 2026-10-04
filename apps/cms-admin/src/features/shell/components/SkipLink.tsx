/** Moves keyboard focus straight to `<main id="main-content">` (AC-15). */
const SkipLink: React.FC = () => (
  <a
    href="#main-content"
    onClick={(event) => {
      // Focus directly instead of changing the URL hash (the router owns the location).
      event.preventDefault();
      document.getElementById('main-content')?.focus();
    }}
    className="sr-only rounded-md bg-background px-4 py-3 text-sm font-medium text-foreground shadow-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
  >
    Skip to content
  </a>
);
SkipLink.displayName = 'SkipLink';

export default SkipLink;
