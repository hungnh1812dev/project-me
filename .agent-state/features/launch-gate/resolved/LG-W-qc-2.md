# LG-W-qc#2 Debug env dump in web startup log (high, qc)
Problem: InstrumentationNode.setup.ts logged the JSON of the server env (secrets included) at startup; AppEnv.rules.ts defaulted an unset APP_ENV to development.
Impact: the web pod log of images 0.0.1c/0.0.1d exposed secret values; a missing APP_ENV no longer failed startup.
Root cause: debug edits left uncommitted in the working tree and baked into an image built from a dirty tree.
Fix applied: both files reverted to HEAD (not committed; a clean rebuild and redeploy is still needed)
