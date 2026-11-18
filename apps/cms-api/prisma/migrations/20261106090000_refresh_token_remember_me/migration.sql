-- D22: whether the sign-in asked to be remembered. Existing rows read true (30-day lifetime).
ALTER TABLE "refresh_tokens" ADD COLUMN "remember_me" BOOLEAN NOT NULL DEFAULT true;
