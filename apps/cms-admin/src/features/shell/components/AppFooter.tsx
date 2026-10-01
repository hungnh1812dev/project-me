/** Product, app version (from `package.json`) and year (AC-34). */
const AppFooter: React.FC = () => (
  <footer className="border-t border-border px-4 py-3 text-xs text-muted-foreground lg:px-6">
    hungnhdev CMS · v{__APP_VERSION__} · © {new Date().getFullYear()}
  </footer>
);
AppFooter.displayName = 'AppFooter';

export default AppFooter;
