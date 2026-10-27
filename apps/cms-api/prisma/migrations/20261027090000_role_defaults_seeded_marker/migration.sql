-- AlterTable
ALTER TABLE "roles" ADD COLUMN "default_permissions_seeded_at" TIMESTAMPTZ(6);

-- Hand-written: a system role that already has rows counts as seeded, so the
-- seed never touches a role the Owner has configured. A role without rows
-- (guest before it got a default) is seeded once on the next deploy.
UPDATE "roles" SET "default_permissions_seeded_at" = now()
WHERE EXISTS (SELECT 1 FROM "permissions" WHERE "permissions"."role_id" = "roles"."id");
