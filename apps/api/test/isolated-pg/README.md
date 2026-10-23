# PostgreSQL isolado da dívida de créditos

A suíte está completa e desligada. Esta fase não inicia container, não cria banco, não aplica migration e não abre conexão.

O único destino autorizado para uma fase futura é:

- host `127.0.0.1`
- porta `55432`
- banco `after_credit_ledger_test`
- usuário `after_credit_ledger_test`
- senha placeholder `disposable-local-only`

A trava recusa o banco `after`, o banco `after_refund_tx` e a porta `5432` no host. `DATABASE_URL` do `.env` da API não é lida pelo guard nem pelo adaptador. A porta `5432` aparece só como porta interna do container, publicada no host em `55432`.

## Pré-requisitos

- Docker com `docker compose`.
- Node e as dependências já presentes em `apps/api`.
- O módulo `pg`, carregado só depois da autorização. Ele não é importado enquanto `ISOLATED_PG_CONNECT_ENABLED` estiver `false`.
- A pasta `prisma/migrations` inteira. A migration `20261013125000_credit_obligation_and_ledger` altera `CreditPurchase`, `Banner` e `CreditCouponRedemption` e cria as tabelas novas. Ela não aplica sozinha num banco vazio.

Nenhuma migration desta pasta cria extensão, role extra ou serviço externo. O histórico em ordem de nome é suficiente.

## Por que não entra no Jest normal

- `npm test` usa `rootDir: src` e `*.spec.ts`.
- `npm run test:e2e` usa `*.e2e-spec.ts`.
- A suíte é `test/isolated-pg/credit-ledger.isolated-pg.ts`.
- `ISOLATED_PG_CONNECT_ENABLED` permanece `false`. A suíte só deixa o `describe.skip` quando o processo passa em todas as verificações do destino descartável, inclusive `AFTER_ISOLATED_PG_START=authorized`. Sem essas variáveis, carregar o arquivo não abre socket.

## Sequência futura

Na pasta `apps/api`, só com autorização explícita para conectar:

1. Criar o container: exportar as variáveis de `test/isolated-pg/isolated-pg.env.example`, definir `AFTER_ISOLATED_PG_START=authorized` e rodar `npx ts-node --transpile-only test/isolated-pg/up.ts`.
2. Confirmar o isolamento. O destino precisa ser exatamente `127.0.0.1:55432/after_credit_ledger_test`. Se o nome for `after`, a porta for `5432` ou o host não for `127.0.0.1`, parar.
3. Aplicar o histórico de migrations só nesse container. O comando `prisma migrate deploy` lê `DATABASE_URL`. Definir essa variável no processo, com o placeholder local, sem gravá-la em `apps/api/.env`. Se a variável não estiver no processo, o Prisma usa o `.env` da API. Imprimir host, porta e nome do banco antes do comando e conferir os três valores.
4. As fixtures nascem dentro de cada teste, com usuários, estabelecimentos, compras, cupom e banners fictícios. Não há seed separado.
5. Manter `ISOLATED_PG_CONNECT_ENABLED` em `false`. Com as variáveis dedicadas e `AFTER_ISOLATED_PG_START=authorized` só nesse processo, rodar `npx jest --config test/isolated-pg/jest-isolated-pg.json --runInBand`.
6. Descartar o ambiente com `down.ts`, também com `AFTER_ISOLATED_PG_START=authorized`.

O adaptador recebe a transação já aberta pelo teste. Ele não executa `BEGIN`, não lê `DATABASE_URL` e não altera `CreditWallet`. `23505` e `P2002` são conflito. `23514` é invariante. `40P01` é deadlock, sem retry. `23503` de vínculo só do estabelecimento é referência ausente. `23503` composto fica sem classificação até o teste comparar o estabelecimento já lido com o solicitado: outro estabelecimento é `venue_mismatch`; pai inexistente é `missing_reference`.

## Encerramento e limpeza

`npx ts-node --transpile-only test/isolated-pg/down.ts`

O compose usa `tmpfs`. `down -v` descarta o volume. Não derrubar outros containers. Os testes que gravam de propósito apagam só os ids `clt*` da própria fixture.

## Falha

- Se o guard recusar, nenhuma conexão foi tentada.
- Se a migration falhar, encerrar o container e subir de novo. Não apontar a correção para `after`.
- Se um teste deixar transação aberta, encerrar o container. A próxima subida começa vazia.
- Um deadlock de teste aborta a transação. Não há nova tentativa automática.
