---
app: cms-admin
summary: React and Vite admin console for content, media and access, on admin.domain.com
replaces: 
---

# cms-admin: spec

Part of the [project spec](../../../SPEC.md). App `cms-admin`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md). In these files a section without an `Applies to:` line covers every flow that touches this app.

## Behaviour

cms-admin is a React 19 + Vite single-page app served by nginx on `admin.domain.com`. Redux Toolkit holds the session and UI state, TanStack Query the server data, and Axios calls the cms-api REST API only ([stack-and-commands.md](../../global/reference/stack-and-commands.md)).

## Requirements

The requirements of the flows that use cms-admin (Docs table of the [project spec](../../../SPEC.md)). New app-wide requirements go here with ids `ADM-<n>`.

### Premium SaaS look (ADM-1..ADM-11, feature `admin-ui-premium-saas`)

Source request (verbatim, user 2026-11-09):

> /ui-ux-pro-max Require: dùng /ui-ux-pro-max để làm. Manager Agent điều phối Planner, UI-Builder, QC để xây dựng hệ thống CMS Admin Dashboard. Tech stack bắt buộc: React + Vite + Tailwind CSS. Vibe: "Modern Premium SaaS" – sang trọng, mềm mại, dịu mắt, nhưng có độ tương phản chức năng sắc nét. 1. Planner phân tích spec thiết kế và tạo Breakdown Task: Layout tổng thể (Sidebar, Header, Main Grid) và Component System (Button đa trạng thái, Toast Notification, Card). 2. UI-Builder code React + Vite + Tailwind, tuân thủ nghiêm ngặt UI/UX spec, code sạch, chia component rành mạch. 3. QC review đối chiếu Color Contrast, Focus States, Micro-interactions; Pass/Fail. UI/UX SPEC: PHONG CÁCH: Premium Minimalist. Bỏ viền thô cứng, border-radius mềm (rounded-xl, rounded-2xl), đổ bóng mượt. Background Slate-50 hoặc xám pastel, Card trắng. ZONING: Neutral nền Slate-100/200, text Slate-700. Primary: Indigo-600 hoặc Violet-600 với colored shadow. Danger: không đỏ tươi, Rose-600, hover Rose-700. LAYOUT: Sidebar sticky, item active có background nổi bật và thanh indicator. Main Grid p-6 hoặc p-8, gap lớn. Nút Create/Save góc trên phải header hoặc dưới phải form; nút Danger tách sang trái hoặc dưới cùng. NOTIFICATIONS: Toast top-right hoặc top-center, icon Success/Error/Warning, backdrop-blur, viền 1px. MICRO-INTERACTIONS: focus ring Indigo-500/50 2-3px, bỏ outline mặc định; transition duration-200/300 hover/active.

User answers (2026-11-09): this look replaces palette A (slate + muted blue) for cms-admin only; apps/web keeps palette A; the planner decides the open points (D23), approved by the user the same day with the focus edge of ADM-9 and toast times of 3-5 s (ADM-8). Stack unchanged: React 19 + Vite 8 + Tailwind v4 (already in use).

Colour names below are Tailwind palette steps; builders write them only as primitive tokens (D23), never as classes in components.

- **ADM-1 Theme.** cms-admin renders with the `premium` theme of the shared tokens (D23): `<html data-theme="premium">` in `apps/cms-admin/index.html`. Every colour, radius, shadow and duration a cms-admin screen or a form-commons primitive uses comes from a semantic token; no raw colour, hex, `rounded-xl`/`2xl` or `shadow-*` literal in components. apps/web keeps today's look (palette A, the token defaults) pixel for pixel.
- **ADM-2 Colour zoning and contrast.** Page background slate-50; cards, sidebar, header, dialogs white; neutral zones (secondary button fill, table header, hover fills, skeletons) slate-100, their hover slate-200; body text slate-700, headings slate-900, secondary text slate-600 (slate-500 is never used for text: it falls under 4.5:1 on slate-100). Primary indigo-600, hover and pressed indigo-700. Destructive rose-600, hover and pressed rose-700, soft rose-50 with rose-700 text. Success, warning and info keep muted green, amber and indigo tints. Every text pair passes 4.5:1, every control boundary and focus indicator 3:1 (WCAG 2.2 AA, table "Contrast pairs" below).
- **ADM-3 Shape and elevation.** No hard 1px grey frames around surfaces: cards, dialogs and toasts are separated by soft shadows (`--shadow-card`, `--shadow-overlay`) and keep a transparent border so Windows forced-colours mode still outlines them. Radii: controls (buttons, inputs, selects) `--radius-control` = 0.75 rem (Tailwind `xl`); cards, dialogs, toasts `--radius-surface` = 1 rem (`2xl`); small items (nav items, menu items, chips, alerts) `--radius-item` = 0.5 rem. Inputs keep a visible 3:1 border (WCAG 1.4.11); table rows keep hairline dividers.
- **ADM-4 Layout shell.**
  - Sidebar (from `md` up): white, 16 rem wide, sticky (stays in view while the page scrolls; long menus scroll inside it), separated from the page by a soft edge shadow, no border. Nav items: `--radius-item`, hover slate-100; the active item has an indigo-50 background, indigo-700 text, medium weight and a 3 px indigo-600 indicator bar on its left inner edge, plus `aria-current="page"` (never colour alone). Below `md` the menu sheet uses the same item styles.
  - Header (top bar): sticky at the top of the content column, 64 px, white at 90 % or more opacity with backdrop blur and a soft bottom shadow; app name and menu button below `md`, user menu at the right.
  - Main grid: content padding `p-6`, `lg:p-8`; vertical gap between page sections `gap-6`, `lg:gap-8`; page grids of cards (the status home) use the same gaps. Content width unchanged.
  - Page header: title and description at the left, the page's Create (or other one primary) action at the right of the title row (`PageHeader` `action`).
- **ADM-5 Buttons.** Variants as today (primary, secondary, success, warning, destructive, ghost, link) restyled: primary indigo-600 with a coloured indigo shadow (`--shadow-primary`, stronger on hover); secondary slate-100 fill with slate-700 text, hover slate-200; ghost transparent, hover slate-100; destructive rose-600, hover rose-700, no coloured shadow. Every variant has hover, active (pressed: darker step and scale 0.98), focus-visible (ADM-9), disabled (50 % opacity, no shadow, not clickable) and loading (spinner, same width, no repeat submit) states. At most one primary per view or dialog (ui-direction §2).
- **ADM-6 Action placement.** Button order stays secondary left, primary right, end-aligned (decision of 2026-10, kept by D23). Page level: Create at the right of the page header. Forms: Save at the bottom right of the form (document edit: right end of its sticky action bar). A destructive action next to a Save sits apart at the left end of the same bar, or in a bottom "Danger zone" card of an edit page; in a confirm dialog the destructive confirm takes the primary position (right) and names the action ("Delete 3 documents").
- **ADM-7 Card.** One `Card` primitive in form-commons: white, `--radius-surface`, `--shadow-card`, padding `p-6` (`compact` `p-4`, `flush` none for tables and lists that bring their own padding); a clickable card raises to `--shadow-card-hover` on hover and shows the focus ring. No card inside a card: an inner group uses a slate-50 section or a divider. Every bordered `bg-card` block in cms-admin views and shared components moves onto `Card`. Page states of a card screen: the loading skeleton and the empty state (no rows yet, or a feature not configured: a title and an optional hint) each sit in a `Card` where the table or grid would be, so the screen never swaps a card for bare text; the empty state is one shared component, default padding (user question 2026-11-10, CAPSC-15). A forbidden notice or a failed load stays a `FormAlert` (with its retry), not inside a `Card`: an alert is its own tinted surface.
- **ADM-8 Toast.** A new form-commons toast on Radix Toast (already in the `radix-ui` dependency, no new package). Tones `success`, `error`, `warning`, `info`, each with its lucide icon (circle check, circle x, triangle alert, info) and tone colour on the icon only; title, optional description, a close button with an accessible name. Surface: white at 90 % or more opacity, backdrop blur, 1 px border, `--radius-surface`, `--shadow-overlay`. Placement: top right from `sm` up, top centre below `sm`; newest on top, at most 3 shown. Auto-dismiss within 3-5 s, never a toast that stays (user 2026-11-09): success and info 4 s, warning and error 5 s; hover or keyboard focus pauses the timer; Esc closes the focused toast; F8 moves focus to the toast region. Error and warning toasts are announced assertively, others politely. Enter: fade and 8 px slide in 300 ms; exit: fade 200 ms. cms-admin mounts one provider in `app/`; screens call `useToast().showToast(...)`; all text from `configs/locales`. Which outcomes use a toast and which stay inline: cms-admin RULES "Feedback: toast or inline".
- **ADM-9 Focus and micro-interactions.** No default browser outline. Every interactive element shows a focus-visible indicator: a 3 px indigo-500/50 halo plus a 1 px solid indigo-600 edge (the edge carries the 3:1 the translucent halo cannot; destructive controls use rose tints the same way). Hover and active changes run with `--duration-fast` (200 ms) for colour, shadow and press; overlays and toasts with `--duration-base` (300 ms), except a dialog's close: its content closes at once (no exit animation) and only its backdrop fades out in `--duration-base`, taking no clicks while it fades, so a click right after a dialog closes reaches the page; only `color`, `background-color`, `box-shadow`, `opacity` and `transform` animate. With `prefers-reduced-motion: reduce` durations are 0 and nothing scales or slides.
- **ADM-10 Not in scope.** No dark mode (v1 decision kept); the system font stack stays; no change to routes, data, API calls or permissions; no new dependency; apps/web unchanged; the only behaviour changes are that transient action outcomes move from inline notices to toasts (ADM-8) and that a role with no readable page sees the Welcome sidebar (ADM-11).
- **ADM-11 Welcome sidebar (user 2026-11-10).** The sidebar shows only the pages the signed-in role may read; a page the role cannot read is hidden (has no item). A role with no read permission on any sidebar page sees a default Welcome sidebar in place of the menu, with the heading "Welcome to the system" and the line "Contact the administrator to be granted access." (text from `configs/locales`, no link or control). Routes, API calls and permissions are unchanged; cms-api still decides every request. The reviewer role is out of scope (analysed later, feature `reviewer-console`). Design and the open access gap: [admin-navigation.md](../../modules/admin-navigation.md) "Empty menu and landing route".

Contrast pairs (QC checks each; values for the Tailwind sRGB steps):

| Pair | Ratio | Needs |
|---|---|---|
| slate-700 text on slate-50 / white | 9.9 / 10.4 | 4.5 |
| slate-600 text on white / slate-100 | 7.6 / 6.9 | 4.5 |
| white on indigo-600 (primary) | 6.3 | 4.5 |
| indigo-700 on indigo-50 (active nav) | 7.0 | 4.5 |
| white on rose-600 (destructive) | 4.7 | 4.5 |
| rose-700 on rose-50 (soft destructive) | 5.7 | 4.5 |
| indigo-600 focus edge on white / slate-50 | 6.3 / 6.0 | 3 |
| input border (`--input`, slate-450) on white | ≥ 3.0 | 3 |
| toast text on its 90 % white surface over slate-900 content | ≥ 4.5 | 4.5 |

Success criteria (the feature checklist rows come from these):
1. cms-admin screens use only semantic tokens: no hex, `rgb(`, `oklch(`, Tailwind palette colour classes, `rounded-xl/2xl` or `shadow-sm/md/lg` literals in `apps/cms-admin/src` and `packages/form-commons/src/components` (grep, tier 1).
2. Every contrast pair above passes, measured in the browser on the dev stack (tier 2).
3. Tab through the shell, a list page, a form and a dialog: every focusable element shows the ADM-9 indicator, none shows the browser outline (tier 2).
4. Hover, active, disabled and loading states of each button variant match ADM-5; transitions take 200 ms (300 ms for overlays and toasts); with reduced motion none animates (tier 2).
5. The sidebar stays in view while a long page scrolls; the active item shows background, text colour and indicator bar and has `aria-current="page"` (tier 2).
6. A save, upload, replace and delete each show one toast of the right tone, top right on desktop and top centre at 375 px, that disappears after its time, pauses on hover and focus, closes by button and Esc, and is announced (tier 1 unit tests plus tier 2 walk).
7. apps/web looks the same as before (screenshots of `/` and `/cv` before and after, tier 2).
8. The full e2e suite passes on the full stack (tier 3).

## Decisions

It follows D14 and D17 ([DECISIONS.md](../../global/DECISIONS.md)).

**D23 cms-admin premium theme (added 2026-11-09, user request; feature `admin-ui-premium-saas`).** The user's request (ADM-1..ADM-10 source) replaces palette A for cms-admin; the user left the open points to the planner, who decided (2026-11-09); the user approved them the same day, with apps/web kept on palette A, the solid focus edge and toast times of 3-5 s:
- **Primary hue: indigo-600** (not violet-600): higher contrast with white text (6.3:1 against 5.7:1), calmer for an all-day tool, and it avoids the purple look ui-direction §4 warns against.
- **Tokens stay owned by form-commons** `src/styles/tokens.css`: the default `:root` block keeps palette A and today's shape (apps/web), a `[data-theme='premium']` block maps the semantic tokens to the new primitives; cms-admin selects it on `<html>`. New semantic tokens, additive, with defaults equal to today's look: `--radius-control`, `--radius-surface`, `--radius-item`, `--shadow-card`, `--shadow-card-hover`, `--shadow-overlay`, `--shadow-primary`, `--shadow-primary-hover`, `--focus-edge`, `--duration-fast`, `--duration-base`, `--nav-active`, `--nav-active-foreground`, `--nav-indicator`. A new app look is one more theme block; a new token is one line per theme plus its `@theme` mapping in `theme.css`.
- **form-commons primitives change** (Button, IconButton, the shared control focus classes, Dialog, DropdownMenu, Popover, Tooltip, FormAlert) to read the new tokens only, so web keeps its look through the defaults; **Card and Toast are new** form-commons primitives (generic, shared by every cms-admin view; Toast wraps Radix like the other overlays).
- **Kept:** no dark mode in v1; system font stack; button order secondary left, primary right, end-aligned, extended by ADM-6 for destructive actions.
- **Focus indicator:** the requested indigo-500/50 halo alone is about 2:1 against white and fails WCAG 1.4.11, so a 1 px solid indigo-600 edge is added (ADM-9).
