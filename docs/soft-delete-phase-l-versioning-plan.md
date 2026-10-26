# Soft Delete — Fase L — Plano de versionamento (preparação)

**Worktree:** `AFTER-wt-soft-delete-a` · **Branch:** `feat/account-soft-delete-phase-a` · **HEAD:** `a0b70f6`  
**Base:** `origin/release/after-v2-202610`  
**Status:** nenhum `git add` / `commit` / `push` executado nesta fase.

---

## 1. Inventário

### 1.1 Modificados (42)

| # | Caminho |
|---|---------|
| 1 | `apps/api/prisma/schema.prisma` |
| 2 | `apps/api/src/admin/accounts/admin-accounts.controller.ts` |
| 3 | `apps/api/src/admin/accounts/admin-accounts.http.spec.ts` |
| 4 | `apps/api/src/admin/accounts/admin-accounts.service.spec.ts` |
| 5 | `apps/api/src/admin/accounts/admin-accounts.service.ts` |
| 6 | `apps/api/src/auth/auth.service.ts` |
| 7 | `apps/api/src/auth/jwt-auth.guard.ts` |
| 8 | `apps/api/src/auth/jwt.strategy.spec.ts` |
| 9 | `apps/api/src/auth/jwt.strategy.ts` |
| 10 | `apps/api/src/auth/optional-jwt-auth.guard.ts` |
| 11 | `apps/api/src/banners/banners.service.spec.ts` |
| 12 | `apps/api/src/banners/banners.service.ts` |
| 13 | `apps/api/src/common/decorators/current-user.decorator.ts` |
| 14 | `apps/api/src/common/moderation/audience.spec.ts` |
| 15 | `apps/api/src/common/moderation/audience.ts` |
| 16 | `apps/api/src/coupons/coupons.service.ts` |
| 17 | `apps/api/src/credits/credits.service.ts` |
| 18 | `apps/api/src/favorites/favorites.service.ts` |
| 19 | `apps/api/src/home/home.service.spec.ts` |
| 20 | `apps/api/src/notifications/notifications.service.ts` |
| 21 | `apps/api/src/promo-push/promo-push.audience.spec.ts` |
| 22 | `apps/api/src/promo-push/promo-push.audience.ts` |
| 23 | `apps/api/src/promo-push/promo-push.store.ts` |
| 24 | `apps/api/src/reports/reports.service.spec.ts` |
| 25 | `apps/api/src/reports/reports.service.ts` |
| 26 | `apps/api/src/uploads/media-cleanup.service.spec.ts` |
| 27 | `apps/api/src/uploads/media-cleanup.service.ts` |
| 28 | `apps/api/src/users/account-deletion.service.spec.ts` |
| 29 | `apps/api/src/users/account-deletion.service.ts` |
| 30 | `apps/api/src/users/users.controller.ts` |
| 31 | `apps/api/src/users/users.ibge.spec.ts` |
| 32 | `apps/api/src/users/users.module.ts` |
| 33 | `apps/api/src/users/users.service.spec.ts` |
| 34 | `apps/api/src/users/users.service.ts` |
| 35 | `apps/api/src/venues/venues.service.spec.ts` |
| 36 | `apps/api/src/venues/venues.service.ts` |
| 37 | `apps/mobile/lib/features/auth/auth_controller.dart` |
| 38 | `apps/mobile/lib/features/auth/login_screen.dart` |
| 39 | `apps/mobile/lib/features/intro/app_startup.dart` |
| 40 | `apps/mobile/lib/features/profile/delete_account_button.dart` |
| 41 | `apps/mobile/lib/features/public/account_deletion_pages.dart` |
| 42 | `apps/mobile/test/account_deletion_test.dart` |

### 1.2 Untracked (73 paths)

**Migrations (5):**

- `apps/api/prisma/migrations/20261026120000_account_soft_delete_phase_a/`
- `apps/api/prisma/migrations/20261026130000_account_soft_delete_session_version/`
- `apps/api/prisma/migrations/20261026140000_account_purge_job_lease/`
- `apps/api/prisma/migrations/20261026150000_account_purge_progress/`
- `apps/api/prisma/migrations/20261026160000_account_purge_lease_epoch/`

**API (47):** admin `admin-accounts.remove.query.ts`; auth guards/session (6); `common/account/*` (2); `upload-cleanup.types.ts`; users lifecycle + `account-purge.*` + `account-recovery.ts` + `account-soft-delete.http.spec.ts` (28); `test/isolated-pg/account-soft-delete.*` + `jest-soft-delete.json` + `soft-delete.harness.ts` (12).

**Mobile (3):** `account_recovery_screen.dart`, `models/deletion_status.dart`, `account_recovery_test.dart`.

**Docs (11):** `account-purge-phase-g.md`, `account-purge-phase-h.md`, `soft-delete-homologation-integrated-report.md`, `soft-delete-jwt-session-version.md`, `soft-delete-phase-i-report.md`, `soft-delete-phase-j-integration-prep.md`, `soft-delete-phase-j-report.md`, `soft-delete-phase-k-publication-checklist.md`, `soft-delete-phase-k-report.md`, `soft-delete-r2-staging.md`, `soft-delete-rollout-runbook.md`, plus this file (`soft-delete-phase-l-versioning-plan.md`).

### 1.3 Escopo Soft Delete vs outro

Todas as alterações no worktree soft-delete estão **no escopo A–K** (lifecycle, JWT, visibilidade pending/purged, purge, admin, mobile, testes, docs).  
**Não há** commits locais além de `a0b70f6` (release tip).

**Checkout principal (`AFTER`):** dirty **independente** (checkout/credits/admin hosting) — **fora** deste plano; não stagear a partir de `AFTER`.

---

## 2. Excluídos do versionamento

| Categoria | Exemplos | Motivo |
|-----------|----------|--------|
| `node_modules/` | Prisma client gerado | Gerado / lock DLL |
| `node_modules/.prisma/client/*.tmp*` | `query_engine-windows.dll.node.tmp*` | Artefato EPERM; regenerável |
| `dist/` | Nest build output | Gitignore |
| `.env` real | — | **Ausente** no worktree |
| Dumps PG | — | Não presentes |
| Segredos prod | — | Não encontrados em paths staged |

**Harness:** URL `127.0.0.1:55432` + senha placeholder `disposable-local-only` — **apenas teste local**; padrão anti-Railway em `soft-delete.harness.ts` é guard, não credencial prod.

**Fixtures:** e-mails `@isolated.test`, `@deleted.after.local`, `@after.local` — sintéticos.

---

## 3. Plano de commits (8 + meta-doc)

Ordem respeita dependências: schema → lifecycle/auth → visibilidade → mobile → purge store/scheduler → executor/financeiro → admin → testes/docs.

### Commit 1 — `feat(db): account soft delete schema and migrations`

**Arquivos:**

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20261026120000_account_soft_delete_phase_a/`
- `apps/api/prisma/migrations/20261026130000_account_soft_delete_session_version/`
- `apps/api/prisma/migrations/20261026140000_account_purge_job_lease/`
- `apps/api/prisma/migrations/20261026150000_account_purge_progress/`
- `apps/api/prisma/migrations/20261026160000_account_purge_lease_epoch/`

**Dependências:** nenhuma (base release).  
**Riscos:** ordem de `migrate deploy` em staging; enum `PURGED` irreversível sem migration down.  
**Testes:** `npx prisma validate` · migrate em PG isolado.

**Staging (não executado):**

```bash
cd "D:/ARQUIVOS PEPE/AFTER/codigo/AFTER-wt-soft-delete-a"
git add apps/api/prisma/schema.prisma \
  apps/api/prisma/migrations/20261026120000_account_soft_delete_phase_a \
  apps/api/prisma/migrations/20261026130000_account_soft_delete_session_version \
  apps/api/prisma/migrations/20261026140000_account_purge_job_lease \
  apps/api/prisma/migrations/20261026150000_account_purge_progress \
  apps/api/prisma/migrations/20261026160000_account_purge_lease_epoch
```

---

### Commit 2 — `feat(api): account lifecycle, deletion flow, and session JWT`

**Arquivos (completos):**

- `apps/api/src/users/account-lifecycle.service.ts`
- `apps/api/src/users/account-recovery.ts`
- `apps/api/src/users/account-deletion.service.ts`
- `apps/api/src/users/account-deletion.service.spec.ts`
- `apps/api/src/users/users.controller.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/jwt.strategy.ts`
- `apps/api/src/auth/jwt.strategy.spec.ts`
- `apps/api/src/auth/jwt-auth.guard.ts`
- `apps/api/src/auth/session-jwt.ts`
- `apps/api/src/auth/session-jwt.spec.ts`
- `apps/api/src/auth/session-jwt-auth.guard.ts`
- `apps/api/src/auth/account-recovery-auth.guard.ts`
- `apps/api/src/auth/deletion-scope-auth.guard.ts`
- `apps/api/src/auth/auth.session-version.spec.ts`
- `apps/api/src/common/decorators/current-user.decorator.ts`
- `apps/api/src/users/account-lifecycle.service.spec.ts`
- `apps/api/src/users/account-lifecycle.session-version.spec.ts`
- `docs/soft-delete-jwt-session-version.md`

**Staging parcial (revisar hunks antes de autorizar):**

- `apps/api/src/users/users.service.ts` — apenas: ctor `AccountLifecycleService`, `requestAccountDeletion`, `cancelAccountDeletion`, `getDeletionStatus`, `deleteAccount` (soft schedule), integração mínima sem purge permanente.
- `apps/api/src/users/users.module.ts` — apenas: `AccountLifecycleService` + controllers existentes **sem** providers purge (se dividir; alternativa: adiar `users.module.ts` inteiro para commit 5).

**Dependências:** commit 1.  
**Riscos:** login recovery vs sessão; invalidação `sessionVersion`.  
**Testes:** `npx jest src/auth src/users/account-lifecycle src/users/account-deletion.service.spec.ts src/users/account-soft-delete.http.spec.ts` (HTTP mock ainda sem PG neste commit).

**Staging (exemplo paths completos):**

```bash
git add apps/api/src/users/account-lifecycle.service.ts \
  apps/api/src/users/account-recovery.ts \
  apps/api/src/users/account-deletion.service.ts \
  apps/api/src/users/account-deletion.service.spec.ts \
  apps/api/src/users/users.controller.ts \
  apps/api/src/auth/auth.service.ts \
  apps/api/src/auth/jwt.strategy.ts \
  apps/api/src/auth/jwt.strategy.spec.ts \
  apps/api/src/auth/jwt-auth.guard.ts \
  apps/api/src/auth/session-jwt.ts \
  apps/api/src/auth/session-jwt.spec.ts \
  apps/api/src/auth/session-jwt-auth.guard.ts \
  apps/api/src/auth/account-recovery-auth.guard.ts \
  apps/api/src/auth/deletion-scope-auth.guard.ts \
  apps/api/src/auth/auth.session-version.spec.ts \
  apps/api/src/common/decorators/current-user.decorator.ts \
  apps/api/src/users/account-lifecycle.service.spec.ts \
  apps/api/src/users/account-lifecycle.session-version.spec.ts \
  docs/soft-delete-jwt-session-version.md
# git add -p apps/api/src/users/users.service.ts
# git add -p apps/api/src/users/users.module.ts   # se split
```

---

### Commit 3 — `feat(api): hide pending and purged accounts from public surfaces`

**Arquivos:**

- `apps/api/src/common/account/account-eligibility.ts`
- `apps/api/src/common/account/account-eligibility.spec.ts`
- `apps/api/src/common/moderation/audience.ts`
- `apps/api/src/common/moderation/audience.spec.ts`
- `apps/api/src/auth/optional-jwt-auth.guard.ts`
- `apps/api/src/banners/banners.service.ts`
- `apps/api/src/banners/banners.service.spec.ts`
- `apps/api/src/coupons/coupons.service.ts`
- `apps/api/src/credits/credits.service.ts`
- `apps/api/src/favorites/favorites.service.ts`
- `apps/api/src/home/home.service.spec.ts`
- `apps/api/src/notifications/notifications.service.ts`
- `apps/api/src/promo-push/promo-push.audience.ts`
- `apps/api/src/promo-push/promo-push.audience.spec.ts`
- `apps/api/src/promo-push/promo-push.store.ts`
- `apps/api/src/reports/reports.service.ts`
- `apps/api/src/reports/reports.service.spec.ts`
- `apps/api/src/venues/venues.service.ts`
- `apps/api/src/venues/venues.service.spec.ts`

**Dependências:** commit 2 (status lifecycle + JWT).  
**Riscos:** regressão promo-push / home feed / notificações.  
**Testes:** `npx jest src/common/moderation src/common/account src/home/home.service.spec.ts src/reports src/venues src/promo-push`.

```bash
git add apps/api/src/common/account \
  apps/api/src/common/moderation/audience.ts \
  apps/api/src/common/moderation/audience.spec.ts \
  apps/api/src/auth/optional-jwt-auth.guard.ts \
  apps/api/src/banners/banners.service.ts \
  apps/api/src/banners/banners.service.spec.ts \
  apps/api/src/coupons/coupons.service.ts \
  apps/api/src/credits/credits.service.ts \
  apps/api/src/favorites/favorites.service.ts \
  apps/api/src/home/home.service.spec.ts \
  apps/api/src/notifications/notifications.service.ts \
  apps/api/src/promo-push/promo-push.audience.ts \
  apps/api/src/promo-push/promo-push.audience.spec.ts \
  apps/api/src/promo-push/promo-push.store.ts \
  apps/api/src/reports/reports.service.ts \
  apps/api/src/reports/reports.service.spec.ts \
  apps/api/src/venues/venues.service.ts \
  apps/api/src/venues/venues.service.spec.ts
```

---

### Commit 4 — `feat(mobile): account deletion and recovery UX`

**Arquivos:**

- `apps/mobile/lib/features/auth/auth_controller.dart`
- `apps/mobile/lib/features/auth/login_screen.dart`
- `apps/mobile/lib/features/auth/account_recovery_screen.dart`
- `apps/mobile/lib/features/auth/models/deletion_status.dart`
- `apps/mobile/lib/features/intro/app_startup.dart`
- `apps/mobile/lib/features/profile/delete_account_button.dart`
- `apps/mobile/lib/features/public/account_deletion_pages.dart`
- `apps/mobile/test/account_deletion_test.dart`
- `apps/mobile/test/account_recovery_test.dart`

**Dependências:** commit 2 (API recovery contract).  
**Riscos:** fluxo TestFlight/Web; token recovery em storage.  
**Testes:** `flutter test test/account_deletion_test.dart test/account_recovery_test.dart`

```bash
git add apps/mobile/lib/features/auth/auth_controller.dart \
  apps/mobile/lib/features/auth/login_screen.dart \
  apps/mobile/lib/features/auth/account_recovery_screen.dart \
  apps/mobile/lib/features/auth/models/deletion_status.dart \
  apps/mobile/lib/features/intro/app_startup.dart \
  apps/mobile/lib/features/profile/delete_account_button.dart \
  apps/mobile/lib/features/public/account_deletion_pages.dart \
  apps/mobile/test/account_deletion_test.dart \
  apps/mobile/test/account_recovery_test.dart
```

---

### Commit 5 — `feat(api): purge scheduler, store, and lease fencing`

**Arquivos:**

- `apps/api/src/users/account-purge.config.ts`
- `apps/api/src/users/account-purge.config.spec.ts`
- `apps/api/src/users/account-purge.states.ts`
- `apps/api/src/users/account-purge.progress.ts`
- `apps/api/src/users/account-purge.store.ts`
- `apps/api/src/users/account-purge.store.spec.ts`
- `apps/api/src/users/account-purge.service.ts`
- `apps/api/src/users/account-purge.service.spec.ts`
- `apps/api/src/users/account-purge.scheduler.ts`
- `apps/api/src/users/account-purge.scheduler.spec.ts`
- `apps/api/src/users/account-purge.concurrency.spec.ts`
- `apps/api/src/users/account-purge.lifecycle.spec.ts`
- `apps/api/src/users/account-purge.audit.ts`
- `apps/api/src/users/account-purge.executor.ts` (interface/token only)

**Staging parcial / completo:**

- `apps/api/src/users/users.module.ts` — **arquivo inteiro** (registra scheduler + store; executor binding).
- `apps/api/src/users/users.service.ts` — hunks: wiring purge **se ainda faltarem** após commit 2 (preferir `git add -p`).

**Dependências:** commits 1–2.  
**Riscos:** scheduler off by default; overlap tick.  
**Testes:** `npx jest account-purge.config account-purge.store account-purge.scheduler account-purge.concurrency`.

```bash
git add apps/api/src/users/account-purge.config.ts \
  apps/api/src/users/account-purge.config.spec.ts \
  apps/api/src/users/account-purge.states.ts \
  apps/api/src/users/account-purge.progress.ts \
  apps/api/src/users/account-purge.store.ts \
  apps/api/src/users/account-purge.store.spec.ts \
  apps/api/src/users/account-purge.service.ts \
  apps/api/src/users/account-purge.service.spec.ts \
  apps/api/src/users/account-purge.scheduler.ts \
  apps/api/src/users/account-purge.scheduler.spec.ts \
  apps/api/src/users/account-purge.concurrency.spec.ts \
  apps/api/src/users/account-purge.lifecycle.spec.ts \
  apps/api/src/users/account-purge.audit.ts \
  apps/api/src/users/account-purge.executor.ts \
  apps/api/src/users/users.module.ts
# git add -p apps/api/src/users/users.service.ts
```

---

### Commit 6 — `feat(api): purge executor, financial retention, and upload cleanup`

**Arquivos:**

- `apps/api/src/users/account-purge.executor.impl.ts`
- `apps/api/src/users/account-purge.executor.spec.ts`
- `apps/api/src/users/account-purge.financial.ts`
- `apps/api/src/users/account-purge.financial.spec.ts`
- `apps/api/src/users/account-purge.upload.ts`
- `apps/api/src/users/account-purge.phase-h.spec.ts`
- `apps/api/src/uploads/upload-cleanup.types.ts`
- `apps/api/src/uploads/media-cleanup.service.ts`
- `apps/api/src/uploads/media-cleanup.service.spec.ts`

**Staging parcial:**

- `apps/api/src/users/users.service.ts` — hunks: `finalizePermanentUserRemoval`, tombstone, financial anonymization, admin purge, upload collection, blockers.

**Dependências:** commits 1, 5.  
**Riscos:** hard delete vs tombstone; R2 partial failure; FK financeiro.  
**Testes:** `npx jest account-purge.executor account-purge.financial account-purge.phase-h src/uploads/media-cleanup`.

```bash
git add apps/api/src/users/account-purge.executor.impl.ts \
  apps/api/src/users/account-purge.executor.spec.ts \
  apps/api/src/users/account-purge.financial.ts \
  apps/api/src/users/account-purge.financial.spec.ts \
  apps/api/src/users/account-purge.upload.ts \
  apps/api/src/users/account-purge.phase-h.spec.ts \
  apps/api/src/uploads/upload-cleanup.types.ts \
  apps/api/src/uploads/media-cleanup.service.ts \
  apps/api/src/uploads/media-cleanup.service.spec.ts
# git add -p apps/api/src/users/users.service.ts
```

---

### Commit 7 — `feat(admin): account purge strategies and lifecycle view`

**Arquivos:**

- `apps/api/src/admin/accounts/admin-accounts.remove.query.ts`
- `apps/api/src/admin/accounts/admin-accounts.controller.ts`
- `apps/api/src/admin/accounts/admin-accounts.service.ts`
- `apps/api/src/admin/accounts/admin-accounts.service.spec.ts`
- `apps/api/src/admin/accounts/admin-accounts.http.spec.ts`

**Dependências:** commit 6 (`UsersService.purgeAccountPermanently`).  
**Riscos:** DELETE hard com blockers 409; purge acidental admin.  
**Testes:** `npx jest src/admin/accounts`

```bash
git add apps/api/src/admin/accounts/admin-accounts.remove.query.ts \
  apps/api/src/admin/accounts/admin-accounts.controller.ts \
  apps/api/src/admin/accounts/admin-accounts.service.ts \
  apps/api/src/admin/accounts/admin-accounts.service.spec.ts \
  apps/api/src/admin/accounts/admin-accounts.http.spec.ts
```

---

### Commit 8 — `test(docs): isolated postgres soft delete suite and rollout docs`

**Arquivos:**

- `apps/api/src/users/account-soft-delete.http.spec.ts`
- `apps/api/src/users/users.service.spec.ts`
- `apps/api/src/users/users.ibge.spec.ts`
- `apps/api/test/isolated-pg/jest-soft-delete.json`
- `apps/api/test/isolated-pg/soft-delete.harness.ts`
- `apps/api/test/isolated-pg/account-soft-delete.auth-eligibility.isolated-pg.ts`
- `apps/api/test/isolated-pg/account-soft-delete.concurrency.isolated-pg.ts`
- `apps/api/test/isolated-pg/account-soft-delete.executor.isolated-pg.ts`
- `apps/api/test/isolated-pg/account-soft-delete.financial.isolated-pg.ts`
- `apps/api/test/isolated-pg/account-soft-delete.hard-delete-retry.isolated-pg.ts`
- `apps/api/test/isolated-pg/account-soft-delete.http-isolated.isolated-pg.ts`
- `apps/api/test/isolated-pg/account-soft-delete.isolated-pg.ts`
- `apps/api/test/isolated-pg/account-soft-delete.lifecycle.isolated-pg.ts`
- `apps/api/test/isolated-pg/account-soft-delete.tombstone-retention.isolated-pg.ts`
- `apps/api/test/isolated-pg/account-soft-delete.webhooks-late.isolated-pg.ts`
- `docs/account-purge-phase-g.md`
- `docs/account-purge-phase-h.md`
- `docs/soft-delete-homologation-integrated-report.md`
- `docs/soft-delete-phase-i-report.md`
- `docs/soft-delete-phase-j-integration-prep.md`
- `docs/soft-delete-phase-j-report.md`
- `docs/soft-delete-phase-k-publication-checklist.md`
- `docs/soft-delete-phase-k-report.md`
- `docs/soft-delete-r2-staging.md`
- `docs/soft-delete-rollout-runbook.md`
- `docs/soft-delete-phase-l-versioning-plan.md`

**Dependências:** commits 1–7.  
**Riscos:** CI sem Docker PG 55432 — suíte skipped sem env.  
**Testes:** `npx jest --config test/isolated-pg/jest-soft-delete.json --runInBand` (env isolado).

```bash
git add apps/api/src/users/account-soft-delete.http.spec.ts \
  apps/api/src/users/users.service.spec.ts \
  apps/api/src/users/users.ibge.spec.ts \
  apps/api/test/isolated-pg \
  docs/account-purge-phase-g.md \
  docs/account-purge-phase-h.md \
  docs/soft-delete-homologation-integrated-report.md \
  docs/soft-delete-phase-i-report.md \
  docs/soft-delete-phase-j-integration-prep.md \
  docs/soft-delete-phase-j-report.md \
  docs/soft-delete-phase-k-publication-checklist.md \
  docs/soft-delete-phase-k-report.md \
  docs/soft-delete-r2-staging.md \
  docs/soft-delete-rollout-runbook.md \
  docs/soft-delete-phase-l-versioning-plan.md
```

---

## 4. Consistência

| Regra | Status |
|-------|--------|
| Todo arquivo A–K atribuído | Sim (42 M + 73 untracked; plano L doc no commit 8) |
| Sem duplicata entre commits | Sim (exceto **parcial intencional**: `users.service.ts`, possivelmente `users.module.ts`) |
| Temporários fora | Sim |
| Migrations ordem 261200→261600 | Sim |
| Testes junto da feature | Unitários junto 2–7; integrados/docs no 8 |
| Checkout principal | Não incluído |

**Nota:** Após commits 2+5+6 com `git add -p`, rodar `git diff users.service.ts` — deve ficar vazio antes do commit 8.

---

## 5. Validação (2026-10-26)

| Verificação | Resultado |
|-------------|-----------|
| `git diff --check` | Sem conflitos de whitespace reportados |
| `npx prisma validate` | OK |
| `npm run build` | OK |
| Jest auth/users/account-purge/admin | **294/294** |
| Jest integrado soft-delete | **23/23** |

---

## 6. Riscos de integração (Git)

- Branch **= release tip** com working tree grande — primeiro push será **8 commits** sobre `after-v2-202610`.
- Conflitos prováveis se release avançar: `auth.service.ts`, `users.service.ts`, `schema.prisma`, mobile auth.
- `main` **+11** vs release — fixes só em main exigem cherry-pick **separado** (fora deste plano).
- Commits intermediários 2/5/6 **podem não compilar** até `users.service.ts` parcial estar completo — preferir **commit atômico de users.service** no 6 após 2+5, ou squash local antes de push (decisão sua).

---

## 7. Confirmação

Nenhum `git add`, `git commit`, `git push`, merge, rebase ou cherry-pick foi executado na Fase L.
