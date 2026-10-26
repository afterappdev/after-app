# Soft delete — JWT invalidation and optional `sessionVersion`

## Current behavior (Phases B–C)

When an account enters `PENDING_DELETION` or sessions are invalidated, the API sets `User.sessionInvalidatedAt` and rejects access tokens whose JWT `iat` (seconds) converts to milliseconds **less than or equal to** `sessionInvalidatedAt`.

This is intentionally conservative: tokens issued in the **same UTC second** as invalidation may be rejected even if they were minted microseconds before the DB update.

## Problem

`iat` has one-second resolution. Comparing `issuedAtMs <= sessionInvalidatedAt` avoids accepting stale tokens after invalidation but can reject legitimate tokens issued in that same second.

## Implemented (Phase E)

Add an integer `sessionVersion` on `User`, default `0`:

1. On login / refresh / recovery cancel: issue JWT with claim `sv` = current `sessionVersion`.
2. On any global session invalidation (deletion request, password change, admin revoke): `sessionVersion += 1` and set `sessionInvalidatedAt` for audit.
3. In `JwtStrategy`: reject when `payload.sv !== user.sessionVersion` **or** when `accountStatus` forbids normal access.

Benefits:

- No false rejections from same-second `iat` vs timestamp.
- Clear semantics: bump version = all older JWTs dead regardless of `iat`.

## Migration note

Requires a Prisma migration (`sessionVersion Int @default(0)`) and backfill. Phase A schema stays compatible until this is deployed; clients do not need changes beyond handling 401 as today.

## Legacy tokens (no `sv`)

- `sessionVersion === 0`: accept only if `iat` is after `sessionInvalidatedAt` (same rules as before).
- `sessionVersion > 0`: reject tokens without `sv` (must sign in again to obtain `sv`).

Recovery tokens (`typ: account_recovery`) never carry `sv`; they still use the `iat` vs `sessionInvalidatedAt` check only.

## Rollout

Migration `20261026130000_account_soft_delete_session_version` adds `User.sessionVersion` default `0`. No production deploy in Phase E.
