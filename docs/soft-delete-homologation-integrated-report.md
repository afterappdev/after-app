# Homologação funcional integrada — PostgreSQL isolado

Data: 2026-10-26  
Worktree: `AFTER-wt-soft-delete-a` / branch `feat/account-soft-delete-phase-a`

## Segurança do ambiente

| Check | Resultado |
|-------|-----------|
| Docker Engine | Ativo |
| Container | `after-credit-ledger-test-after-credit-ledger-pg-1` @ `127.0.0.1:55432` |
| Database | `after_credit_ledger_test` |
| `assertIsolatedPgTarget` | Via `soft-delete.harness.ts` |
| Produção / Railway | Não utilizados |
| R2 / pagamentos | Mockados nos testes de executor (R2) |

Comando integrado (vars de `isolated-pg.env.example` + `AFTER_ISOLATED_PG_START=authorized`):

```bash
npx jest --config test/isolated-pg/jest-soft-delete.json --runInBand
```

## Arquivos alterados / criados

- `test/isolated-pg/soft-delete.harness.ts` — Prisma isolado, fixtures, cleanup
- `test/isolated-pg/account-soft-delete.lifecycle.isolated-pg.ts`
- `test/isolated-pg/account-soft-delete.auth-eligibility.isolated-pg.ts`
- `test/isolated-pg/account-soft-delete.concurrency.isolated-pg.ts`
- `test/isolated-pg/account-soft-delete.financial.isolated-pg.ts`
- `test/isolated-pg/account-soft-delete.executor.isolated-pg.ts`
- `test/isolated-pg/jest-soft-delete.json` — regex ampliada
- `docs/soft-delete-homologation-integrated-report.md` (este arquivo)

## Resultados

| Suíte | Testes | Status |
|-------|--------|--------|
| Schema smoke (original) | 1 | OK |
| Lifecycle | 2 | OK |
| JWT + elegibilidade | 2 | OK |
| Concorrência | 2 | OK |
| Financeiro | 2 | OK |
| Executor + uploads (R2 mock) | 3 | OK |
| **Total integrado** | **12** | **12 passed** |

Unitários `account-purge*`: **39 passed** (sem skip).

## Cobertura por etapa

### Lifecycle
Schedule, grace ~30d, job PENDING, sessionVersion, idempotência de re-schedule, cancel → ACTIVE + CANCELLED, re-schedule após cancel, job único, VENUE com venue.

### JWT / auth (sem OAuth real)
Sessão válida com `sv`, `sv` antigo, legacy sem `sv` após bump, recovery token, recovery expirado (jwt.verify), PENDING bloqueada, PURGED bloqueada.

### Elegibilidade (datas no DB)
Grace futuro → sem claim; grace vencido → claim; ACTIVE → cancel claim; CANCELLED/COMPLETED → sem claim; PROCESSING lease válido → sem claim; lease expirado → novo claim + `leaseEpoch`.

### Concorrência
Dois workers paralelos (1 vencedor), `leaseEpoch`, worker antigo não salva progresso nem COMPLETED, reclaim após lease, cancel durante PROCESSING → conflito.

### Financeiro
Blockers (PAID, obligation open, PENDING+tx, recent/stale/abandoned, FAILED/CANCELLED), tombstone PURGED preserva compras, anonimiza fiscal, idempotência tombstone.

### Executor (isolado, destrutivo só no DB descartável)
Hard delete USER sem venue; retomada de FAILED com manifest; falha upload mock → `UploadPurgeIncompleteError`, stage DATA, manifest persistido, sem COMPLETED.

### Uploads
Testados **via mock** de `deleteStoredUploadsWithReport` no executor (não R2 real).

## Limitações conhecidas

1. **Ordem DATA → UPLOADS:** em hard delete sem blockers, a linha User some antes da fase UPLOADS; falha de upload ainda impede DONE, mas não “restaura” o user.
2. **Executor com blockers financeiros** não chega a UPLOADS (bloqueio em FINANCIAL) — cenário tombstone+upload fica para evolução ou teste E2E dedicado.
3. **VIP / ledger / webhook tardio** — parcialmente cobertos via blockers; sem simulação de webhook real.
4. **Scheduler de produção** não habilitado (`ACCOUNT_PURGE_ENABLED` inalterado).

## Pendências

- Testes R2 com bucket de staging sintético.
- Expandir lifecycle JWT com guards HTTP Nest completos (e2e).
- Tabela de auditoria persistente (opcional).

## Prontidão para integração

**Staging:** migrations já validadas no PG isolado (40); suíte integrada verde; runbook em `soft-delete-rollout-runbook.md`.  
**Produção:** manter purge destrutivo desligado até critérios do runbook.

## Produção

**Intacta** — nenhum deploy, migrate prod, commit ou push nesta etapa.
