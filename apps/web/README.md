# After Web (`apps/web`)

Interface funcional After em React + TypeScript + Bootstrap 5. Publicação prevista no prefixo **`/app/`** (hash routes), sem rewrite global na raiz do site.

## Pré-requisitos

- Node.js 20+
- API local ou homologação (`apps/api`), **não** use produção para testes com escrita

## Configuração

```bash
cd apps/web
cp .env.example .env
# Edite VITE_API_BASE_URL se necessário (padrão http://127.0.0.1:3000)
npm install
```

## Desenvolvimento

```bash
npm run dev
```

Abra a URL do Vite e use rotas hash, por exemplo `#/login` e `#/` (home protegida).

Com `vite.config.ts` `base: '/app/'`, o preview de produção fica em `/app/`.

## Build

```bash
npm run build
npm run preview
```

O artefato sai em `dist/` com assets prefixados `/app/`. Deploy: copiar `dist/` para a pasta `/app/` do site estático (Cloudflare Pages), **sem** alterar `/`, `/baixar/` ou `/admin/`.

## Estrutura

- `src/api` — cliente HTTP e chamadas
- `src/auth` — sessão, contexto, multi-estabelecimento (flag desligada)
- `src/features` — telas por domínio
- `src/layouts` — shell e rotas protegidas
- `src/components` — UI compartilhada

## Sessão

Chaves `localStorage`: `after_web_access_token`, `after_web_user_json` (independentes do Flutter Web).
