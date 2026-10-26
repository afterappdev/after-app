# Account purge — Fase H (integridade, admin, auditoria)

## Política financeira consolidada

| Situação | Blocker temporário? | Ação no purge |
|----------|---------------------|---------------|
| `CreditObligation` status `open` | Sim | Job falha / admin `hard` recusa |
| `CreditPurchase` `PENDING` com `providerTxId` | Sim | Aguardar liquidação ou tombstone |
| `CreditPurchase` `PENDING` sem `providerTxId`, criada nos últimos 7 dias | Sim | Checkout/webhook ainda possível |
| `CreditPurchase` `PENDING` antiga com `provider` sem `providerTxId` | Sim (`purchase_pending_stale_with_provider`) | Webhook tardio possível |
| `CreditPurchase` `PENDING` antiga sem `provider` e sem `providerTxId` | Sim (`purchase_pending_abandoned_unverified`) | Idade não libera; exige FAILED/CANCELLED via reconcile |
| `CreditRefundAudit` kind `refund_signal_under_review` | Sim | Revisão manual de reembolso/chargeback |
| Ledger, compras `PAID`, wallet, VIP entries | Retenção histórica (nota) | Não apagar por cascade; tombstone se Restrict |
| Campos fiscais em `CreditPurchase` (`fiscalDocument`, CPF/CNPJ) | — | Anonimizados em `anonymizeVenueFinancialPii`; IDs de compra/`providerTxId` preservados |
| `Venue.documentType` / `documentDigits` | PII operacional | Limpos no tombstone; `WelcomeCreditClaim.documentKey` (HMAC) permanece para prova one-time |

**Importante:** ausência de `providerTxId` **não** significa ausência de transação externa.

## Tombstone `PURGED`

- E-mail operacional: `purged+{userId}@deleted.after.local`
- Sessões invalidadas (`sessionVersion` incrementado)
- JWT e login recusam `PURGED`
- Venues não aparecem em superfícies públicas (`owner.accountStatus === ACTIVE` exigido)
- Anonimização idempotente (reentrada não altera tombstone)
- Conclusão do job não exige hard delete quando há retenção financeira

## Uploads

- `MediaCleanupService.deleteStoredUploadsWithReport` retorna `failedUrls`
- Executor e purge admin falham com `UploadPurgeIncompleteError` se houver falhas
- Manifesto permanece no job para retry; `COMPLETED` só com lease válido e stage `DONE`

## Exclusão administrativa

- `DELETE /admin/accounts/:id?strategy=hard|tombstone`
- `hard` (default): `409` com `financial_blockers` se houver blockers
- `tombstone`: anonimiza e retém registros financeiros (auditoria `admin_purge_tombstone`)

## Auditoria (logs estruturados, sem tokens/PII)

Eventos: `deletion_requested`, `deletion_cancelled`, `job_started`, `job_blocked`, `data_anonymized`, `uploads_removed`, `uploads_partial_failure`, `job_completed`, `job_failed`, `admin_purge_hard`, `admin_purge_tombstone`.

## Enablement (inalterado da Fase G)

Purge destrutivo automático continua **desligado** em produção (`ACCOUNT_PURGE_ENABLED=false`, `DRY_RUN=true`, arming duplo obrigatório).
