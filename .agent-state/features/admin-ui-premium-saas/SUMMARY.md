# Summary - admin-ui-premium-saas

## Overview
cms-admin and the shared form-commons kit now use the premium SaaS look (D23, ADM-1..ADM-11): indigo and rose tokens in a `premium` theme, a sticky sidebar and top bar, cards on every screen, one toast provider with keyed toasts, footer buttons ordered by function, and a Welcome panel when a role can read no page. Built in 4 phases, 20 tasks, plus fix rounds and the e2e suite.

Sub-features:
- Tokens and primitives: theme tokens, Button and focus ring, form controls, overlays, Card, Toast (APS-1..APS-5, APS-18).
- Toasts and the shell: ToastProvider mounted, sidebar and top bar, Welcome panel (APS-7, APS-8, APS-20, APS-6).
- Surfaces: access tables, auth pages, media, documents, settings blocks on Card (APS-9..APS-12).
- Feedback and actions: keyed toasts for save, publish and upload; footer order; sticky document action bar (APS-13..APS-17).

## Structure
- packages/form-commons: `src/styles` (tokens, theme), `src/components/ui` (Card, Toast, Button, Dialog and others), public API snapshot, README.
- apps/cms-admin: `index.html`, `assets/styles`, `app`, `components` and `components/layouts`, `views`, `features` (access, content, media), `configs/locales/en`.
- apps/e2e: new specs for dialog footers, toasts, premium theme, admin shell and cards; updated media and toast specs.
- apps/web: auth footers (DR2).
- docs/modules, CHANGELOG.md, root package.json, `.claude` agents and skills (workflow files only).

Commits: 41 from f72c9317 to head 221540ab.

## Issues resolved
- APS-17-qc-1: Escape with a toast open left the dialog open.
  - Problem: pressing Escape with a dialog open while a toast was shown left the dialog open.
  - Impact: keyboard users could not dismiss alt-text, revoke and delete dialogs for up to 5 s after any toast.
  - Root cause: Radix re-registers a toast on top of the Escape layer stack on every re-render, so the toast handled Escape and the dialog's handler was never attached.
  - Fix applied: Toast onEscapeKeyDown keeps the toast open and clicks the top dialog's cancel button (Toast.tsx closeOpenDialog); unit test added.
- APS-B-qc-1: toast viewport covered the user menu.
  - Problem: the fixed toast viewport at top 16 px overlapped the user menu button in the sticky header while a toast showed.
  - Impact: admin users could not open the user menu for 3-5 s after each toast.
  - Root cause: the viewport offset ignored the 64 px sticky header.
  - Fix applied: viewport moved to top-20 (below the header) in form-commons Toast.tsx; uncommitted.
- APS-A-qc-1-tooltip: Esc did not close a just-opened dialog.
  - Problem: full e2e on the built stack failed in MediaLibrary, WebSession, MediaAttach and RichtextToolbar: Esc did not close a just-opened dialog.
  - Impact: users pressing Esc right after opening a dialog from an icon button with a tooltip could not close it; the e2e suite was not green.
  - Root cause: the phase added an exit animation to the Tooltip content; the tooltip of the trigger stays mounted and on the Radix layer stack during its exit, so Esc went to the tooltip instead of the dialog.
  - Fix applied: removed the open and closed animation classes from TooltipContent in packages/form-commons/src/components/ui/Tooltip.tsx (not committed yet).
- APS-A-qc-1: a fading dialog overlay took clicks.
  - Problem: after Esc, the fading Dialog overlay still took clicks; ADM-9 says it takes none.
  - Impact: a click during the 300 ms fade hit the backdrop, so the lost-click defect of CAPSA-20 could return.
  - Root cause: Radix sets inline `pointer-events: auto` on the overlay, which beats the `data-[state=closed]:pointer-events-none` class.
  - Fix applied: made the closed rule important (`pointer-events-none!`) in DialogOverlay of form-commons Dialog.tsx; dist rebuilt (not committed yet).

## Open risks
- Editors and guests cannot use cms-admin until the reviewer role is analysed (Known gap, user decision 2026-11-10).
- Guest read of GET /content-types is not yet restricted (follow-up in features.md).
