# Handoff - launch-gate
Updated: 2026-10-30 after migration to feature folders

## In progress / next
- Next: run checkpoints LG-A and LG-B (tier 3; tasks committed), then LG-2 -> LG-1 -> LG-fix-* -> LG-3.
- LG-0 answers so far (user, 2026-10-27/28): multer = done (LG-dep). Cloudinary: user supplies real `CLOUDINARY_*` values (not in repo). CI: GitHub Environments, branch rules and secrets set up by the user; first real CI run still unverified. Deploy target: self-managed k3s. Browser walk before launch: user walks it; qc only notes. Reviewer state at launch: off. DB role split: done (ADR 0012). Still open: untested deploy pieces (k8s manifests, real Traefik/Cloudflare client IP, rclone off-site upload, readOnlyRootFilesystem on admin, SOPS on a cluster), setup token handling, e2e flakiness.
- LG-3 inputs (Q-LG1..5): live check on the production config before public (staging with production config allowed); user deploys and gives web/admin origins plus a throwaway 2FA admin, disabled afterwards; write probes before public only, test data deleted; ZAP passive baseline allowed, ask again right before.
- Owner steps before deploy (devops-runbook): R2 bucket lock proof (Q-OPS6), Supabase verify-full check, Cloudflare Access decision.

## Direct requests

## Follow-ups
- LG-3: verify masking of phone/email live (not observable on smoke: no published CV docs).
