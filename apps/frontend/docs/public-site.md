# Public site

The Next.js App Router shell of the public site.

## Feature

Root layout, home page and base CSS. `globals.css` sets background and foreground, maps them in `@theme inline`, and pins the shared `--ring` and `--border` tokens to their pre-restyle values (see [UI integration](./ui-integration.md)).

## Files

| File | Spec |
| ---- | ---- |
| `src/app/globals.css` | Tailwind and `@repo/ui` theme import, base colours, pinned `--ring` / `--border`. |
| `src/app/layout.tsx` | Root layout. |
| `src/app/page.tsx` | Home page. |
| `src/app/favicon.ico` | Site icon. |
| `Dockerfile` | Multi-stage Next.js standalone image. Runs as the non-root user `abyss` (numeric `USER 1001`, files copied with `--chown=1001:1001`) so Kubernetes `runAsNonRoot` can verify it; port 3000. CI checks the user with `.github/scripts/image-user.sh` (see `docs/ci-cd.md`). |

## Testing

No tests. `pnpm --filter frontend typecheck` and `lint`.

## Related

- [UI integration](./ui-integration.md)
