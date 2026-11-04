# Handoff
Updated: 2026-10-30 after cleanup (finished work summarised in `tasks/done.md`; full old text backed up outside the repo)

## In progress / next
- Next: run checkpoints LG-A and LG-B (tier 3; tasks committed), then LG-2 -> LG-1 -> LG-fix-* -> LG-3. BK-A, BK-B, CI-A can share a qc run; RVOFF-B after RVOFF-doc.
- LG-0 answers so far (user, 2026-10-27/28): multer = done (LG-dep). Cloudinary: user supplies real `CLOUDINARY_*` values (not in repo). CI: GitHub Environments, branch rules and secrets set up by the user; first real CI run still unverified. Deploy target: self-managed k3s. Browser walk before launch: user walks it; qc only notes. Reviewer state at launch: off. DB role split: done (ADR 0012). Still open: untested deploy pieces (k8s manifests, real Traefik/Cloudflare client IP, rclone off-site upload, readOnlyRootFilesystem on admin, SOPS on a cluster), setup token handling, e2e flakiness.
- LG-3 inputs (Q-LG1..5): live check on the production config before public (staging with production config allowed); user deploys and gives web/admin origins plus a throwaway 2FA admin, disabled afterwards; write probes before public only, test data deleted; ZAP passive baseline allowed, ask again right before.
- Owner steps before deploy (devops-runbook): R2 bucket lock proof (Q-OPS6), Supabase verify-full check, Cloudflare Access decision.

## Follow-ups
- LG-3: verify masking of phone/email live (not observable on smoke: no published CV docs).
- User question, open: error responses outside a handler carry no `Cache-Control: no-store`; a cached "off" 404 could hide the Reviewer button after switch-on. Small core-builder task to add no-store to all error responses? -> user.
- Remove the multer pnpm override once Nest pins multer >= 2.5.0 -> core-builder, unscheduled.
- Hardening (optional, not findings): `SubjectCatalog.nonSensitiveFields` falls back to all fields for an unknown slug (core-builder); `ContactCard` EMAIL_SHAPE accepts `?`, `&` (apps/web/src/features/cv/ContactCard.tsx) (ui-builder).
- `scripts/docs/architecture/{build,notes}.py` still list old cms-admin paths (`features/registry.ts` -> `Features.registry.ts`); regenerate docs/architecture -> core-builder, unscheduled.
- Test gaps: access guards, the four management services and AnonymousActorService have no unit spec; e2e flakiness on a shared stack (TwoFactor, content-presence) -> run on a fresh stack; spec isolation unscheduled.
- conventions.md is over ~10 KB; user decided to keep Tooling and smoke/e2e procedures there until a docs page covers them.
