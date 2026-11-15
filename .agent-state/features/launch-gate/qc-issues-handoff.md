## qc
- QCI-W1 · row CLG-47 · DevTools Chrome rejects the local CA of project-me.localhost · status: closed · next step: user trusts tier3-ca in that Chrome or allows ignoring cert errors
- QCI-W2 · row CLG-44 · image commit, 3b5ae508 ancestry and build APP_ENV unknown · status: closed
- QCI-W3 · row CLG-50 · /cv console shows 500 and React #441 · status: closed (accepted as designed by the user 2026-11-14; CLG-50 passes on 0.0.1e)
- QCI-W4 · row CLG-51 · debug block gone on 0.0.1e; APP_ENV on web-secrets still staging · status: closed (replan-LG-api-1: staging accepted, production check is CLG-55 in LG-F)
- QCI-E1 · row CLG-34 · cms-api and cms-admin 0.0.1h not rebuilt from the RC (layers dated 07:44, same as the LG-W images) · status: closed (user accepted cached cms-admin:0.0.1l in writing 2026-11-15; RECHECK pass) · RECHECK 2026-11-14: still open, cms-api 0.0.1i CrashLoopBackOff on NODE_ENV=staging (stale image)
- QCI-E2 · row CLG-14 · scripts/launch-check.sh missing (LG-2 open) · status: open · next step: LG-2 delivers the script
- QCI-E3 · row CLG-15, CLG-16 · no TOTP/2FA code source for the Q-LG2 account; admin cert interstitial in DevTools Chrome · status: open · next step: user gives the way to get codes (or walks it) and trusts/allows the admin cert
- QCI-E4 · row CLG-56 · stage 2 data not entered yet · status: open · next step: user enters the data and says so
- QCI-E5 · row CLG-32 · scope 9d6a334..HEAD is the whole repo; no CLG-29 record · status: open · next step: user decides full suite or a nearer base
