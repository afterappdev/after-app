# Soft Delete — Fase K — Auditoria final e preparação Git

**Worktree:** `AFTER-wt-soft-delete-a` · **Branch:** `feat/account-soft-delete-phase-a`  
**Base rastreada:** `origin/release/after-v2-202610` (HEAD commit `a0b70f6`)  
**Data:** 2026-10-26 · **Restrições:** sem commit/push/merge/rebase/deploy; produção intacta.

---

## 1. Estado Git

| Verificação | Resultado |
|-------------|-----------|
| `git status -sb` | `feat/account-soft-delete-phase-a...origin/release/after-v2-202610` |
| Commits exclusivos na branch vs release | **Nenhum** — soft delete está **inteiro no working tree** (não commitado) |
| `git log -1` | `a0b70f6 fix(payments): accept lowercase Mercado Pago order webhook signatures` |
| Tracking | `[origin/release/after-v2-202610]` |

**Modificados (41):** ver `git diff --name-status` (schema, auth, users, admin, uploads, audience, mobile exclusão, etc.).

**Novos (untracked):** 5 migrations soft delete, stack `account-purge*`, guards JWT/recovery, 10 suítes `test/isolated-pg/account-soft-delete.*`, docs Fases G–J, Flutter recovery.

**Checkout principal** (`AFTER`): **não alterado por esta fase**; possui dirty files **próprios** (checkout/credits/admin hosting) — separado do worktree soft delete.

---

## 2. EPERM Prisma (Windows)

### Diagnóstico
- Erro: `EPERM: rename ...query_engine-windows.dll.node.tmpXXXX -> ...query_engine-windows.dll.node`
- **Causa:** segundo `prisma generate` enquanto a DLL já está **carregada** por processo Node (Jest integrado / testes API). Windows impede substituir DLL em uso.
- **Evidência:** arquivos órfãos `query_engine-windows.dll.node.tmp2216`, `.tmp7208`, `.tmp9988` após falhas.
- Processos Node vistos: Adobe CC + Cursor agent worker — **não** encerrados (conforme restrição).
- Antivírus: possível agravante no `rename`; não confirmado.

### Resolução aplicada (sem apagar `node_modules`)
1. Remoção apenas de `*.tmp*` em `node_modules/.prisma/client/`
2. `npx prisma generate` **sem** testes concorrentes → OK
3. `npm run build` (`prisma generate && nest build`) **após** Jest encerrado → **OK**

### Recomendação operacional
- Não rodar `npm run build` em paralelo com Jest que usa Prisma no mesmo worktree.
- CI: sequência `generate` → `test` → `nest build`, ou `nest build` após testes.
- Se EPERM persistir: fechar IDE/test watcher, limpar `*.tmp*`, repetir generate.

---

## 3. Build e testes

| Comando | Resultado |
|---------|-----------|
| `npx prisma validate` | OK |
| `npx prisma generate` | OK (v5.22.0) |
| `npm run build` | OK (após idle) |
| Jest `auth\|users\|account-purge\|admin-accounts` | **294/294** (após fix `users.ibge.spec.ts` — ctor `AccountLifecycleService`) |
| Jest integrado soft-delete | **23/23** |
| Flutter deletion + recovery | **20/20** |
| `flutter analyze` | 5 **info** pré-existentes |

**Correção Fase K:** `users.ibge.spec.ts` — injeção de mock de lifecycle + `LocationsService` na posição correta do construtor.

---

## 4. Auditoria de segurança (leitura)

| Tópico | Avaliação |
|--------|-----------|
| Retomada pós hard delete sem `User` | `orphanResume` no store + skip elegibilidade no executor se estágio ≥ DATA |
| Progresso persistido | `progressStage` + `uploadManifest`; retomada por estágio |
| Ownership do job | `processingWhere(jobId, workerId, leaseEpoch)` em save/mark/complete |
| `leaseEpoch` | Incremento no claim; mutações exigem epoch atual |
| Conta ACTIVE | Claim cancela job; purge não elegível |
| PURGED em auth | Login genérico “credenciais inválidas”; JWT sessão rejeita PENDING/PURGED |
| Uploads | Falha parcial → job FAILED; manifesto preservado; retry |
| Financeiro | Blockers + tombstone retém ledger/obrigação/VIP; anonimiza PII fiscal |
| Admin DELETE | `strategy=hard\|tombstone`; blockers → 409; ADMIN não deletável |
| Purge destrutivo prod | `accountPurgeDestructiveAllowed`: **sempre false em production**; exige ENABLED + !DRY_RUN + ARM + EXECUTE |

**Riscos residuais (não impeditivos de merge):** smoke R2 staging real; overlap de merge com release em auth/credits/mobile.

---

## 5. Divergências entre branches (read-only)

| Par | Commits |
|-----|---------|
| `release` ahead of `main` | **8** |
| `main` ahead of `release` | **11** |
| Merge-base | `f5f05a7` |

Soft delete **não está em commits** — integração Git = commitar working tree **em cima** de `release/after-v2-202610` (ou rebase futuro **não executado aqui**).

**Arquivos concorrentes com release:** auth, credits, admin accounts, mobile auth/checkout, promo-push, schema Prisma.

**Migrations exclusivas soft delete:**  
`20261026120000` … `20261026160000` (5 pastas).

---

## 6. Plano de commits proposto (não executado)

1. **db:** schema + 5 migrations soft delete  
2. **api(lifecycle):** `AccountLifecycleService`, deletion-request/cancel, session version  
3. **api(auth):** JWT `sv`, recovery guards, PENDING/PURGED  
4. **api(visibility):** audience, favorites, reports, home — contas pending/purged  
5. **mobile:** exclusão, recovery, startup  
6. **api(purge-core):** store, scheduler, lease, config (defaults off)  
7. **api(purge-exec):** executor, financial, uploads, audit  
8. **api(admin):** lifecycle view, DELETE strategy  
9. **test+docs:** isolated PG, unitários, runbook, Fases G–K  

Ajustar fatias conforme conflitos no merge com release.

---

## 7. Estratégia de integração

Ver também `docs/soft-delete-phase-j-integration-prep.md`.

- Integrar **sobre** `origin/release/after-v2-202610` estável (preserva VIP, admin dashboard, MP webhooks, checkout cartão/PIX).  
- **Não** substituir fixes que existem só em `main` sem cherry-pick explícito posterior (11 commits).  
- Revisão manual: `auth.service.ts`, `jwt.strategy.ts`, `credits.service.ts`, `users.service.ts`, `schema.prisma`.  
- Manter escopo: evitar levar dirty do checkout principal para o worktree.

---

## 8. Checklist de publicação futura

Ver `docs/soft-delete-rollout-runbook.md` + itens:

1. Backup PostgreSQL produção  
2. Inventário `_prisma_migrations` vs 5 novas migrations  
3. `migrate deploy` em janela controlada  
4. Deploy API (`ACCOUNT_PURGE_ENABLED=false`)  
5. Flutter Web / Android / iOS com recovery UX  
6. Login, recovery, exclusão e-mail  
7. Compra PIX/cartão + Apple/Google (regressão)  
8. Admin: lifecycle + purge manual desligado  
9. R2 staging smoke (bucket dedicado)  
10. Purge automático **off** até critérios staging  
11. Rollback: revert deploy + flags; schema aditivo — sem drop  

---

## 9. Pendências staging / critérios liberação

**Staging:** 23/23 integrado, build OK, bucket R2 staging, purge armado só em non-prod, 7 dias sem FAILED irrecuperáveis.

**Produção:** runbook assinado, legal/audit tombstone, kill switch testado, nenhum teste em Railway/R2 prod.

---

## 10. Produção intacta

Confirmado: sem deploy, sem migrate prod, sem R2 prod, sem habilitar purge destrutivo, sem commit/push/merge, checkout principal não modificado pelo worktree soft delete.
