-- Phase E: deterministic JWT invalidation via sessionVersion (default 0 for existing users).
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
