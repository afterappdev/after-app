# Soft Delete — Fase J — Relatório final

**Worktree:** `AFTER-wt-soft-delete-a` · **Branch:** `feat/account-soft-delete-phase-a`  
**Data:** 2026-10-26 · **PostgreSQL isolado:** `127.0.0.1:55432/after_credit_ledger_test`  
**Restrições respeitadas:** sem commit/push/merge/deploy; sem prod/Railway/R2 prod; dados sintéticos.

---

## 1. Arquivos alterados (Fase J)

### Produção / correções
| Arquivo | Mudança |
|---------|---------|
| `apps/api/src/users/account-purge.executor.impl.ts` | Retomada segura: `revalidateEligibility` ignora usuário ausente se estágio ≥ DATA |
| `apps/api/src/users/account-purge.store.ts` | Claim de job após hard delete / tombstone (`orphanResume`, `purgedResume`); preserva FAILED ao liberar lease |

### Testes integrados novos
| Arquivo |
|---------|
| `test/isolated-pg/account-soft-delete.hard-delete-retry.isolated-pg.ts` |
| `test/isolated-pg/account-soft-delete.tombstone-retention.isolated-pg.ts` |
| `test/isolated-pg/account-soft-delete.webhooks-late.isolated-pg.ts` |
| `test/isolated-pg/account-soft-delete.http-isolated.isolated-pg.ts` |
| `test/isolated-pg/soft-delete.harness.ts` (helpers ledger/VIP) |
| `test/isolated-pg/account-soft-delete.concurrency.isolated-pg.ts` (cenário uploads + lease) |

### Documentação
| Arquivo |
|---------|
| `docs/soft-delete-r2-staging.md` |
| `docs/soft-delete-phase-j-integration-prep.md` |
| `docs/soft-delete-phase-j-report.md` (este arquivo) |

---

## 2. Testes novos (Fase J)

- Hard delete + falha R2 + retry sem linha `User` + DONE + idempotência de uploads
- Tombstone com wallet, compras, obrigação, ledger, VIP; retry de uploads pós-PURGED
- Webhooks tardios simulados (PIX/cartão/Apple/Google/reembolso) — somente DB
- Concorrência em uploads (lease expira, epoch, worker A bloqueado, B conclui uma vez)
- HTTP Nest + Prisma real: deletion-request/cancel/status, DELETE me, delete-request/confirm, login PENDING/PURGED, admin DELETE

---

## 3. Testes aprovados (regressão Fase J)

| Suíte | Resultado |
|-------|-----------|
| Jest integrado soft-delete (`jest-soft-delete.json`) | **23/23** |
| Jest unitário `account-purge*` | **39/39** |
| `prisma validate` | OK |
| `prisma generate` / `npm run build` | **EPERM** no Windows (DLL Prisma em uso); reexecutar com IDE/processo sem lock |
| Flutter `account_deletion_test` + `account_recovery_test` | **20/20** |
| `flutter analyze` | **5 infos** pré-existentes (sem novos erros de soft delete) |

---

## 4. Falhas encontradas e correções

| Problema | Correção |
|----------|----------|
| `tryClaimJob` recusava retry quando `User` já removido (hard delete) | Elegibilidade `orphanResume` se `progressStage ≥ DATA` |
| Job FAILED voltava a PENDING ao claim inválido | Mantém status FAILED quando aplicável |
| Executor relançava ELIGIBILITY em usuário inexistente | Skip de elegibilidade se estágio ≥ DATA |
| Testes HTTP recovery 401 (iat vs `sessionInvalidatedAt`) | Token via `/auth/login` + ajuste de invalidação no teste |

---

## 5. Resultados por etapa

### Etapa 2 — Hard delete + retry upload
- Manifesto persistido em DATA antes da falha de upload
- User removido; job FAILED; worker-2 reivindica; UPLOADS conclui; `markCompleted` true; segunda passagem não chama R2 de novo

### Etapa 3 — Tombstone + retenção
- PURGED, PII fiscal anonimizado, obrigação/ledger/VIP/wallet preservados
- Login rejeitado; upload falha + retry com manifesto intacto em conta PURGED

### Etapa 4 — Webhooks tardios (simulados)
- Compras identificáveis por `providerTxId`; crédito idempotente; blockers atualizados; `refund_signal_under_review`; conta não recriada

### Etapa 5 — Concorrência uploads
- Worker A perde lease; epoch incrementa; A não salva progresso nem completa; B termina job uma vez

### Etapa 6 — HTTP NestJS
- Rotas críticas validadas contra PostgreSQL isolado (ver suíte `http-isolated`)

### Etapa 7 — R2 staging
- Sem bucket staging no repo; ver `docs/soft-delete-r2-staging.md`; testes continuam com mock

### Etapa 8 — Regressão
- Ver tabela §3

### Etapa 9 — Integração
- Ver `docs/soft-delete-phase-j-integration-prep.md`

---

## 6. Pendências

- Smoke R2 staging real (bucket + credenciais isoladas)
- `npm run build` local após liberar lock do `query_engine-windows.dll.node`
- Merge coordenado com `origin/release/after-v2-202610` (muitos arquivos compartilhados com VIP/admin/checkout)

---

## 7. Riscos impeditivos para produção

- Purge destrutivo ainda depende de flags (`ACCOUNT_PURGE_ENABLED`, arming) — **não habilitar em prod** até staging completo
- Integração com release traz conflitos em auth, credits, admin, mobile checkout — exige ordem de merge definida
- Upload real R2 não homologado end-to-end fora de mock

---

## 8. Próxima ação recomendada

1. Rebase/merge **somente após review** da branch contra `origin/release/after-v2-202610` usando o plano em `soft-delete-phase-j-integration-prep.md`
2. Provisionar bucket R2 staging e um smoke manual de purge (1 conta sintética)
3. Staging: migrar PG isolado → DB staging; `ACCOUNT_PURGE_ENABLED` dry-run → arm → purge limitado
4. Commit único ou sequência em 2–3 PRs (schema+migrations, API purge, mobile/auth) conforme prep doc
