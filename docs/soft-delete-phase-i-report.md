# Soft Delete — Fase I — Relatório de validação

Worktree: `D:\ARQUIVOS PEPE\AFTER\codigo\AFTER-wt-soft-delete-a`  
Branch: `feat/account-soft-delete-phase-a`  
Tracking: `origin/release/after-v2-202610`  
**Produção: intacta** (sem deploy, migrate prod, purge real ou R2 prod).

---

## 1. Inventário de alterações

### Escopo Soft Delete (API)
- Lifecycle: `account-lifecycle.service.ts`, `account-recovery.ts`, guards JWT/session, `users.controller.ts`
- Purge: `account-purge.*`, executor, store, scheduler, financial, audit, upload report
- Admin: `admin-accounts.*`, query `strategy=hard|tombstone`
- Visibilidade: `common/moderation/audience.ts`, venues, favorites, reports, notifications, promo-push
- Auth: `session-jwt.ts`, `jwt.strategy.ts`, login bloqueia `PURGED`
- Uploads: `media-cleanup.service.ts` + `deleteStoredUploadsWithReport`

### Flutter
- `auth_controller.dart`, `account_recovery_screen.dart`, `deletion_status.dart`, deletion/recovery tests, páginas públicas

### Documentação
- `docs/soft-delete-jwt-session-version.md`
- `docs/account-purge-phase-g.md`
- `docs/account-purge-phase-h.md`
- `docs/soft-delete-rollout-runbook.md` (Fase I)

### Alterações provavelmente fora do escopo Soft Delete
Nenhuma modificação adicional identificada **nesta fase** além da stack já presente na branch release; divergência grande vs `origin/main` inclui admin dashboard, créditos VIP, etc. da release base — revisar no merge, não misturar com fixes isolados da `main`.

### Git
- Muitos arquivos **modificados + untracked** (sem commit, conforme restrição).
- Base de comparação funcional: `origin/release/after-v2-202610`.

---

## 2. Migrations verificadas (A–I)

| Ordem | Migration | Conteúdo |
|-------|-----------|----------|
| 1 | `20261026120000_account_soft_delete_phase_a` | Lifecycle, `AccountPurgeJob`, deletion fields |
| 2 | `20261026130000_account_soft_delete_session_version` | `User.sessionVersion` |
| 3 | `20261026140000_account_purge_job_lease` | `lockedUntil`, `lockedBy` |
| 4 | `20261026150000_account_purge_progress` | `PURGED`, `progressStage`, `uploadManifest` |
| 5 | `20261026160000_account_purge_lease_epoch` | **Fase I:** fencing `leaseEpoch` |

`prisma validate` e `prisma generate`: **OK**.

---

## 3. PostgreSQL isolado

| Verificação | Resultado |
|-------------|-----------|
| Docker Desktop | **Indisponível** (daemon não encontrado) |
| Porta `127.0.0.1:55432` | Fechada |
| `migrate deploy` | **Não executado** |
| Proposta | Usar `apps/api/test/isolated-pg/` + `isolated-pg.env.example`; subir com `AFTER_ISOLATED_PG_START=authorized` e `up.ts`; `DATABASE_URL` apontando **somente** para `after_credit_ledger_test` |

Suíte preparada (skip automático sem autorização): `test/isolated-pg/account-soft-delete.isolated-pg.ts` + `jest-soft-delete.json`.

**Pendência:** validar migrations em sequência real quando Docker estiver disponível.

---

## 4. Lifecycle (Jest / unitário)

| Cenário | Cobertura |
|---------|-----------|
| Schedule / cancel / job reuse | `account-lifecycle.service.spec.ts`, `account-purge.lifecycle.spec.ts` |
| JWT `sv` / sessionVersion | `auth.session-version.spec.ts`, `jwt.strategy.spec.ts` |
| HTTP deletion flows | `account-soft-delete.http.spec.ts` |
| PURGED auth / público | `auth.service` + `audience` + `phase-h` |
| 30 dias simulados | Store/lifecycle com `permanentDeletionAt` no passado |

Integração E2E completa com DB: **pendente** (PostgreSQL isolado).

---

## 5. Financeiro

Política **refinada na Fase I** (`account-purge.financial.ts`):

- `PENDING` + `providerTxId` → blocker
- `PENDING` recente (&lt;7d) sem `providerTxId` → blocker
- `PENDING` antiga com `provider` setado sem `providerTxId` → blocker (webhook tardio)
- `PENDING` antiga sem `provider` e sem `providerTxId` → blocker `purchase_pending_abandoned_unverified` (idade **não** libera sozinha; exige status terminal FAILED/CANCELLED via reconcile)
- `FAILED` / `CANCELLED` / `PAID` / `REFUNDED` → não entram como PENDING
- VIP ledger notes; refund_review blocker

Testes: `account-purge.financial.spec.ts` (**OK**).

---

## 6. Concorrência / fencing

Implementado **`leaseEpoch`** monotônico (migration `20261026160000`):

- Incremento atômico no claim
- `saveProgress`, `renewLease`, `markCompleted`, `markFailed` exigem `(jobId, workerId, leaseEpoch)`

Testes: `account-purge.concurrency.spec.ts`, `account-purge.store.spec.ts` (**OK**).

---

## 7. R2 / uploads

- Relatório verificável `deleteStoredUploadsWithReport`
- Falha parcial → `UploadPurgeIncompleteError`, sem `COMPLETED`
- Testes unitários: `media-cleanup.service.spec.ts`, executor/phase-h

**Testes contra bucket real:** não executados (restrição). **Pendência:** ambiente R2 de staging sintético.

---

## 8. Auditoria

- `AccountPurgeAuditService`: logs estruturados (sem PII/tokens)
- Eventos: `deletion_requested`, `deletion_cancelled`, `job_started`, `job_blocked`, `job_resumed`, `data_anonymized`, `uploads_removed`, `job_completed`, `job_failed`, `admin_purge_*`
- **Persistência em tabela:** não implementada (Etapa 7 opcional); recomendado pós-rollout se compliance exigir

Mapeamento runbook ↔ código: `job_started`≈purge_started, `uploads_removed`≈uploads_deleted, `job_completed`≈purge_completed.

---

## 9. Admin DELETE

- `?strategy=hard|tombstone`
- Hard + blockers → `409 financial_blockers`
- Tombstone + auditoria
- Testes: `admin-accounts.service.spec.ts`, `admin-accounts.http.spec.ts`

Confirmação explícita destrutiva: **query `strategy=tombstone`** (hard default); reforço UX admin opcional futuro.

---

## 10. Flutter / Web

| Comando | Resultado |
|---------|-----------|
| `flutter test` account_deletion + account_recovery | **20 passed** |
| `flutter analyze` | **5 infos** pré-existentes (deprecated `dart:html`, `home_screen`, `depend_on_referenced_packages`) — **não regressão soft delete** |

Responsividade `AccountRecoveryScreen`: não automatizada nesta fase; validação manual recomendada em staging.

Web: páginas em `account_deletion_pages.dart` — sem alteração nesta fase além da stack existente.

---

## 11. Testes finais API

| Comando | Resultado |
|---------|-----------|
| `prisma validate` | OK |
| `prisma generate` | OK |
| `npm run build` | OK |
| Jest (purge, lifecycle, auth, admin, media) | **104 tests, 104 passed** (após correções Fase I) |

---

## 12. Correções implementadas na Fase I

1. Migration + código **`leaseEpoch`** (fencing)
2. Política financeira reforçada (7 dias + provider/stale/abandoned)
3. Nota VIP + testes financial/concurrency/store
4. Suíte PostgreSQL isolada (preparada, skip sem Docker)
5. Runbook de rollout
6. Fix `Prisma.DbNull` em `contacts` no tombstone
7. `job_resumed` audit no scheduler

---

## 13. Riscos remanescentes

- Migrations não aplicadas em DB real (Docker off)
- Purge destrutivo nunca exercido end-to-end com PostgreSQL
- R2 real / arquivos compartilhados não testados
- Auditoria só em log (sem retention queryable)
- Reconcile manual de `PENDING` abandonados antes de purge em contas venue com histórico de checkout
- Divergência release vs main no merge

---

## 14. Runbook

Ver [`docs/soft-delete-rollout-runbook.md`](./soft-delete-rollout-runbook.md).

---

## 15. Critérios de liberação (resumo)

Staging com migrate + smoke lifecycle + admin 409/tombstone + Flutter contra staging + **purge flags off em prod** + snapshot DB antes migrate prod.

---

## 16. Confirmação produção

- Nenhum acesso a `after-db-definitive` / Railway prod
- Nenhum `migrate deploy` em produção
- Nenhum purge destrutivo habilitado
- Nenhum deploy / commit / push / merge executado nesta fase
