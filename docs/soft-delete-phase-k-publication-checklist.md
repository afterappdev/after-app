# Soft Delete — Checklist de publicação (futuro)

Não executar até staging completo. Purge automático **desligado** na primeira subida.

## Pré-deploy
- [ ] Backup completo do PostgreSQL de produção (retention validado)
- [ ] Listar migrations aplicadas em prod vs repositório (`_prisma_migrations`)
- [ ] Confirmar `ACCOUNT_PURGE_ENABLED=false` (e dry-run default) no env prod
- [ ] Confirmar bucket R2 prod **não** usado em testes de purge

## Migrations
- [ ] Aplicar em staging: 5 migrations `20261026120000` … `20261026160000`
- [ ] Smoke: colunas lifecycle, `AccountPurgeJob`, enum `PURGED`
- [ ] Repetir em prod na janela acordada

## Deploy API
- [ ] Deploy artefato pós-`npm run build`
- [ ] Health check + login normal
- [ ] Scheduler purge: enabled **false** em prod

## Clientes
- [ ] Flutter Web publicado (exclusão + recovery)
- [ ] Android / iOS stores (mesma versão mínima acordada)
- [ ] Deep links exclusão (`delete-request` / confirm)

## Testes pós-deploy (sintético / contas teste)
- [ ] Login USER/VENUE
- [ ] Agendar exclusão + recovery cancel
- [ ] Login PENDING → recovery token (sem sessão normal)
- [ ] PURGED → login negado
- [ ] Checkout PIX/cartão (compra teste)
- [ ] Apple/Google sandbox (se aplicável)
- [ ] Admin: list/get conta, DELETE tombstone em conta teste **sem** purge scheduler

## Purge destrutivo (fase posterior)
- [ ] R2 staging: delete real de objeto teste
- [ ] Staging: arming progressivo (`ARM` + `EXECUTE`) em non-prod only
- [ ] Monitor audit logs + jobs FAILED

## Rollback
- [ ] Revert deploy API/cliente para versão anterior
- [ ] Flags purge off
- [ ] **Não** reverter migrations em prod salvo plano DBA; desabilitar purge se schema já aplicado
- [ ] Restaurar backup apenas se purge acidental com perda
