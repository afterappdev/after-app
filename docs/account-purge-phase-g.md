# Account permanent purge — Phase G (retention & execution design)

## Dependency matrix (diagnostic)

| Domain | Models / paths | On User delete | On Venue delete | Phase G treatment |
|--------|----------------|----------------|-----------------|-------------------|
| Profile PII | `User` | — | — | Anonymize or hard-delete row when safe |
| Venue profile | `Venue` | Cascade | — | Anonymize; delete only if no `Restrict` children |
| Social auth | `SocialOnboardingToken` | — | — | `deleteMany` by email/provider ids |
| Apple tokens | `User.appleRefreshTokenEnc` | — | — | Revoke via `AppleTokenService` |
| Favorites, reviews, blocks | various | Cascade | Cascade | Removed with user/venue cascade |
| Notifications, device tokens | various | Cascade | — | Cascade |
| Reports filed | `Report.reporterId` | SetNull | — | Preserve report; reporter nulled |
| Credit purchases | `CreditPurchase` | via Venue cascade | Cascade | **Retain**; anonymize fiscal PII fields |
| Refund audit | `CreditRefundAudit` | via Venue | Cascade | **Retain** (audit) |
| Credit obligation | `CreditObligation` | via Venue | **Restrict** | **Block purge** while `status=open` |
| Credit ledger | `CreditLedgerEntry` | via Venue | **Restrict** | **Retain** append-only |
| VIP / wallet | `VipCreditEntry`, `CreditWallet` | via Venue | Cascade / Restrict mix | **Retain** ledger; wallet follows venue policy |
| Welcome credit proof | `WelcomeCreditClaim` | No FK | No FK | **Retain** digest (antifraud); legal basis in schema |
| Uploads | R2 / local URLs | — | — | Manifest on job → `MediaCleanupService` |
| Purge job | `AccountPurgeJob` | No User FK | — | Progress + manifest on job row |

**Partial deletion risk:** `user.delete()` cascades to `Venue`, which **fails** if `CreditObligation` or `CreditLedgerEntry` exist (`onDelete: Restrict`). The executor must not call `user.delete()` until blockers are clear or must fall back to **anonymize-in-place** (`accountStatus=PURGED`).

## Retention policy (by category)

| Category | Retain | Action | Legal / product note |
|----------|--------|--------|----------------------|
| User PII (name, email, avatar, location) | No | Anonymize / delete | LGPD erasure after grace period |
| Venue marketing (name, photos, banners, promos) | No | Delete media + DB rows | Not needed post-purge |
| CreditPurchase amounts, status, provider ids | Yes | Keep row; strip `fiscal*` PII | Fiscal / dispute / reconciliation |
| CreditRefundAudit | Yes | Keep | Audit trail |
| CreditObligation (open) | Yes | **Block** hard delete until settled | Do not destroy debt evidence |
| CreditLedgerEntry | Yes | Keep | Append-only accounting |
| VipCreditEntry | Yes | Keep | Consumption proof |
| WelcomeCreditClaim digest | Yes | Keep | Antifraud (documented in schema) |
| Reports about others | Yes | Reporter SetNull | Moderation history |

Items marked **requires external legal validation**: fiscal retention term for NF-e-related fields; chargeback window for card/Apple/Google (treat provider ids as retained until reconciliation completes).

## Execution order

1. **ELIGIBILITY** — `PENDING_DELETION`, `permanentDeletionAt <= now`, valid lease (`lockedBy`).
2. **FINANCIAL** — Detect blockers; anonymize fiscal PII on purchases; fail job if open obligation.
3. **MANIFEST** — Persist upload URL list on `AccountPurgeJob.uploadManifest`.
4. **DATA** — Revoke Apple; delete onboarding tokens; delete/anonymize profile and UGC; tombstone user or delete when safe.
5. **UPLOADS** — `MediaCleanupService.deleteStoredUploads` (idempotent); track pending URLs in manifest.
6. **DONE** — `COMPLETED` on job only when all mandatory stages succeeded.

## Failure / retry

| Outcome | Job status | Progress |
|---------|------------|----------|
| Open financial obligation | `FAILED` | `FINANCIAL` |
| Lease lost | Abort; `FAILED` or reclaim | unchanged |
| R2 partial failure | `FAILED` | `UPLOADS` + manifest kept |
| Idempotent retry | Resume from `progressStage` | Skip completed stages |

## Enabling destructive auto-purge (future — not Phase G rollout)

All must be true (and **not** production):

- `ACCOUNT_PURGE_ENABLED=true`
- `ACCOUNT_PURGE_DRY_RUN=false`
- `ACCOUNT_PURGE_ARM_DESTRUCTIVE=true` (explicit arming)
- `ACCOUNT_PURGE_EXECUTE=true`

Phase G ships executor code with **`accountPurgeDestructiveAllowed()` returning false in production always**, regardless of env typos.
