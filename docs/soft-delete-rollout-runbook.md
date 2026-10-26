# Soft Delete — Runbook de publicação (não executar nesta fase)

## 1. Branches e commits

| Item | Valor |
|------|--------|
| Branch de feature | `feat/account-soft-delete-phase-a` |
| Base de integração sugerida | `origin/release/after-v2-202610` |
| Checkout de trabalho | worktree `AFTER-wt-soft-delete-a` |
| Main | **Não integrar diretamente** sem revisão de divergência (296+ arquivos vs `origin/main` na release) |

Registrar SHA final do merge commit após PR aprovado (não gerado nesta fase).

## 2. Divergências main vs release

- Soft delete vive na linha **release/after-v2-202610**, não na `main` atual.
- Integração recomendada: merge release → main **ou** PR feature → release primeiro, depois release → main conforme política do time.
- Conflitos prováveis: créditos, admin dashboard, categorias (fixes em `main` separados).

## 3. Migrations novas (A–I)

Ordem lexicográfica (aplicar em sequência):

1. `20261026120000_account_soft_delete_phase_a`
2. `20261026130000_account_soft_delete_session_version`
3. `20261026140000_account_purge_job_lease`
4. `20261026150000_account_purge_progress` (+ enum `PURGED`)
5. `20261026160000_account_purge_lease_epoch` (fencing `leaseEpoch`)

**Pré-requisito:** histórico completo anterior (`20260807120000_init` …) já aplicado no ambiente alvo.

## 4. Ordem de integração

1. Revisão de código + CI verde na branch.
2. Merge na release de staging.
3. `prisma migrate deploy` em **staging** (Railway manual).
4. Deploy API staging (Railway manual).
5. Smoke tests lifecycle (sem purge destrutivo).
6. Apps mobile/web apontando para staging.
7. Repetir em produção só após critérios de liberação (seção 12).

## 5. Backup e restauração

- Snapshot PostgreSQL Railway **antes** de `migrate deploy` em produção.
- Retenção mínima: 7 dias; testar restore em ambiente descartável.
- Documentar horário UTC do snapshot e ID Railway.

## 6. Compatibilidade API

- JWT passa a exigir claim `sv` (sessionVersion) em sessões novas; legado tolerado conforme `docs/soft-delete-jwt-session-version.md`.
- Clientes antigos: continuam login; após agendamento de exclusão, tokens invalidados.
- Endpoints novos: `/users/me/deletion-request`, cancelamento, recovery, admin `lifecycle`/`purgeJob`.

## 7. Ordem de deploy

1. **API** (migrations + deploy Railway)
2. **Web** (páginas públicas de exclusão/recovery)
3. **Android / iOS** (fluxos de exclusão e recovery)

Mobile pode tolerar API nova com apps antigos se endpoints opcionais; recomendado deploy API primeiro.

## 8. Rollback

- **API:** redeploy imagem anterior Railway; **não** reverter migrations destrutivas em produção sem plano DBA.
- Se migration já aplicada: forward-fix preferível a `migrate resolve --rolled-back`.
- Desligar worker: `ACCOUNT_PURGE_ENABLED=false`.

## 9. Variáveis de ambiente

| Variável | Produção inicial | Notas |
|----------|------------------|-------|
| `ACCOUNT_PURGE_ENABLED` | `false` | Scheduler off |
| `ACCOUNT_PURGE_DRY_RUN` | `true` | Simulação |
| `ACCOUNT_PURGE_ARM_DESTRUCTIVE` | unset/false | Arming |
| `ACCOUNT_PURGE_EXECUTE` | unset/false | Execução real |
| `NODE_ENV` | `production` | Bloqueia destructive mesmo com flags |

Demais: JWT secrets, `PUBLIC_API_URL`, R2 — inalterados.

## 10. Purge destrutivo desabilitado

Manter **todas** as flags acima até checklist operacional completo + janela de observação em staging com purge simulado apenas.

Ativação futura do worker: seção 12.

## 11. Railway

Deploy **manual** no painel Railway; este runbook não dispara pipeline GitHub.

## 12. Critérios de aprovação para produção

- [ ] Migrations aplicadas em staging sem erro
- [ ] Testes Jest account-purge + lifecycle + auth verdes
- [ ] Flutter analyze/test verdes nos módulos de exclusão
- [ ] Teste manual: schedule → cancel → schedule → JWT invalidado
- [ ] Teste admin: hard com blockers → 409; tombstone → audit log
- [ ] PostgreSQL isolado: migrations validadas (quando Docker disponível)
- [ ] Nenhum incidente financeiro em staging
- [ ] Runbook revisado por responsável de produto + backend

## 13. Plano de ativação futura do worker (staging → prod)

1. `ENABLED=true`, `DRY_RUN=true` — observar logs `account-purge simulated` 48h.
2. `DRY_RUN=false`, sem arming — continua simulado se destructive false.
3. Staging: `ARM_DESTRUCTIVE=true`, `EXECUTE=true`, `NODE_ENV≠production` — purge real em contas de teste sintéticas.
4. Produção: **somente** após critérios 12 + aprovação explícita; manter destructive false em prod até política legal/ops definida.
