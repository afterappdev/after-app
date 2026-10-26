# Soft Delete — R2 staging (Fase J)

## Situação atual

- O repositório documenta R2 em `apps/api/.env.example` com bucket padrão `after-uploads` e URL pública de produção (`R2_PUBLIC_URL`).
- **Não há** bucket de staging isolado versionado no projeto (sem prefixo/env dedicado tipo `R2_BUCKET_STAGING`).
- Os testes automatizados de purge usam **`MediaCleanupService` mockado** (`deleteStoredUploadsWithReport`) nos Jest integrados.

## Configuração recomendada para homologação futura (não criada automaticamente)

| Variável | Valor sugerido |
|----------|----------------|
| `R2_ACCOUNT_ID` | Conta Cloudflare **não prod** |
| `R2_BUCKET` | `after-uploads-staging` (ou prefixo `staging/` no bucket) |
| `R2_PUBLIC_URL` | URL pública **distinta** de produção |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Credenciais scoped só ao bucket staging |

Guardrails:

- Nunca apontar `R2_BUCKET` de staging para o bucket de produção durante testes de purge.
- Manter `ACCOUNT_PURGE_ENABLED=false` fora de ambientes explicitamente armados.
- Preferir objetos sintéticos (`https://isolated.test/...`) em CI; reservar R2 real staging para smoke manual pós-merge.

## Pendência

Teste integrado **real** contra R2 staging permanece **pendente** até existir bucket + credenciais isoladas. Até lá, a homologação de uploads cobre contrato, manifesto, retry e fencing via mock.
