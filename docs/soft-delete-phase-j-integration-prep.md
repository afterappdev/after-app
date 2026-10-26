# Soft Delete — Preparação de integração (Fase J, read-only)

Comparação **sem alterar histórico**: `feat/account-soft-delete-phase-a` vs `origin/release/after-v2-202610` vs `origin/main`.

## 1. Arquivos concorrentes (alto overlap)

A feature branch diverge da release em dezenas de paths compartilhados com trabalho paralelo (admin, VIP, promo-push, credits, mobile checkout). Soft delete toca explicitamente:

- **Auth/sessão:** `jwt.strategy.ts`, guards (`session-jwt`, `recovery`, `deletion-scope`), `auth.service.ts`
- **Users/admin:** `users.service.ts`, `users.controller.ts`, `account-lifecycle.service.ts`, `admin-accounts.*`
- **Financeiro:** `account-purge.financial.ts`, `credits.service.ts`, schema Prisma
- **Uploads:** `media-cleanup.service.ts`
- **Mobile:** `auth_controller.dart`, `delete_account_button.dart`, `account_recovery_screen.dart`, páginas públicas de exclusão

Integrar soft delete **depois** de alinhar a release reduz conflitos em auth e credits.

## 2. Migrations divergentes (stack soft delete)

Migrations **exclusivas** do soft delete (não presentes em main antigo):

1. `20261026120000_account_soft_delete_phase_a`
2. `20261026130000_account_soft_delete_session_version`
3. `20261026140000_account_purge_job_lease`
4. `20261026150000_account_purge_progress` (+ enum `PURGED`)
5. `20261026160000_account_purge_lease_epoch`

A release `after-v2-202610` já contém migrations de ledger/VIP/welcome-credit — aplicar soft delete **após** `migrate deploy` da release baseline.

## 3. Dependências admin e VIP

- **Admin:** `DELETE /admin/accounts/:id?strategy=hard|tombstone`, lifecycle no `getById`, blockers financeiros
- **VIP / ledger:** tombstone retém `VipCreditEntry`, `CreditLedgerEntry`, `CreditObligation`; blockers incluem obrigação aberta e `refund_signal_under_review`
- Purge scheduler deve coexistir com jobs de reconcile card/VIP — desligar purge em prod até staging

## 4. Riscos checkout e autenticação

| Área | Risco | Mitigação |
|------|-------|-----------|
| Login | Conta `PENDING_DELETION` → recovery JWT, não sessão normal | Testes HTTP + mobile recovery |
| Webhooks MP/Apple/Google | Confirmação tardia após agendamento de exclusão | Blockers + simulações Fase J; não duplicar créditos (`operationKey` / updateMany idempotente) |
| Checkout | Compra `PENDING` vira blocker ou PAID pós-exclusão | Política em `account-purge.financial.ts` |
| JWT `sv` | Invalidação ao agendar exclusão | Clientes devem usar recovery flow |

## 5. Ordem recomendada de integração

1. Merge/release baseline `after-v2-202610` estável (CI verde)
2. Migrations soft delete (5 arquivos) — **uma PR só schema**
3. API: lifecycle + purge store/executor/scheduler (flags off)
4. Auth guards + mobile recovery/exclusão
5. Admin purge + documentação runbook
6. Habilitar scheduler em staging apenas

## 6. Estratégia de commits futuros (sugestão)

- `feat(db): account soft delete migrations`
- `feat(api): account lifecycle and purge pipeline (disabled by default)`
- `feat(api): auth session version and recovery JWT`
- `feat(mobile): deletion and recovery UX`
- `test: isolated pg soft delete suite`
- `docs: rollout runbook and staging checklist`

## 7. Deploy coordenado

1. Deploy API com `ACCOUNT_PURGE_ENABLED=false`
2. `prisma migrate deploy` (janela de manutenção curta)
3. Deploy mobile (recovery + exclusão) — backward compatible
4. Staging: arm purge → monitor audit logs → smoke R2 staging
5. Produção: purge permanece off até critérios §9–10

## 8. Rollback

- **Código:** revert deploy anterior; flags já off em prod
- **Schema:** migrations são aditivas (colunas/status/job); rollback de schema **não** recomendado — desabilitar purge e cancelar jobs PROCESSING
- **Dados:** tombstone/PURGED irreversível — rollback lógico via restore backup PG se purge acidental

## 9. Critérios para staging

- [ ] 23/23 Jest integrado soft-delete verde
- [ ] HTTP isolated verde
- [ ] Bucket R2 staging dedicado + 1 smoke delete
- [ ] `ACCOUNT_PURGE_ENABLED` + arming testados com conta sintética
- [ ] Admin consegue ver lifecycle + job

## 10. Critérios para produção

- [ ] Staging 7 dias sem FAILED jobs não recuperados
- [ ] Runbook assinado (`soft-delete-rollout-runbook.md`)
- [ ] Legal/audit OK com retenção financeira tombstone
- [ ] Feature flag + kill switch validados
- [ ] Nenhum teste usando Railway/prod/R2 prod
