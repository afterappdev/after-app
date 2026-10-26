# Soft Delete — Fase M — Relatório de commits (local)

**Worktree:** `AFTER-wt-soft-delete-a` · **Branch:** `feat/account-soft-delete-phase-a`  
**Base:** `a0b70f6` → **HEAD:** `1bed452` · **Ahead of release:** 7 commits  
**Push:** não realizado.

## Tabela de commits

| # | Hash | Mensagem | Arquivos | Validações | Resultado |
|---|------|----------|----------|------------|-----------|
| 1 | `f2f17c2441a1b019d9758ad88b19937ca57d9477` | feat(db): add account soft delete schema and migrations | 6 | prisma validate | OK |
| 2 | `666b8c7e4447f0976e1fbab6785a70c7643976ff` | feat(api): implement account lifecycle, purge pipeline, and session JWT | 46 | npm run build; jest auth/users/account-purge 279 | OK |
| 3 | `b4db8d8d6bdd8ab78708b22bb0dba85e32a9474b` | feat(api): restrict visibility for pending deletion and purged accounts | 19 | jest visibility specs; npm run build | OK |
| 4 | `4ea0aa4a770430e42b768d77216c8c817078a63e` | feat(mobile): add account deletion and recovery flow | 9 | flutter test 20/20 | OK |
| 5 | `8a7c7ae5bf34ab50a4881e16f791969f4d47f291` | feat(admin): support account lifecycle view and purge strategies | 5 | jest admin/accounts 15/15 | OK |
| 6 | `ae5fdeea8dc0e54d6efd4a3052d0ea61abe56e15` | test(soft-delete): add isolated postgres coverage and rollout documentation | 24 | (regressão final pós-série) | OK |
| 7 | `1bed45205ff62b38d1f6635780d51ccffe85332b` | docs(soft-delete): add phase M execution report | 1 | — | OK |

## Agrupamento vs Fase L

- **8 commits L → 6 funcionais + 1 docs M stub + 1 relatório M** (7 ahead; núcleo API unificado no commit 2).
- **Staging parcial:** não utilizado (`users.service.ts` inteiro no commit 2).

## Regressão final

| Check | Resultado |
|-------|-----------|
| git status | clean |
| prisma validate | OK |
| npm run build | OK |
| Jest auth/users/account-purge/admin | 294/294 |
| Jest integrado soft-delete | 23/23 |
| Flutter exclusão/recuperação | 20/20 |
| flutter analyze | 5 infos pré-existentes |

## Excluídos

node_modules, dist, .env, Prisma `.tmp*`, checkout principal `AFTER`.

## Pendências

Push; PR/merge com release; R2 staging smoke; integração com divergência main (+11).
