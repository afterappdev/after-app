-- Idempotency for report pushes. New enum value only; existing events stay unchanged.
ALTER TYPE "AdminPushEventType" ADD VALUE IF NOT EXISTS 'REPORT_CREATED';
