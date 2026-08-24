# After

App de descoberta de promoções do dia por cidade (iOS, Android e Web) com API NestJS.

## Estrutura

```
AFTER/
  apps/
    api/          # NestJS + Prisma + PostgreSQL
    mobile/       # Flutter (Android, iOS, Web, Windows)
  docker-compose.yml
  Montserrat/     # Fontes da marca (fonte do app em apps/mobile/assets)
  logo roxa.png
  app after.pdf   # Briefing / wireframes
  README.md
```

## Pré-requisitos

| Ferramenta | Versão sugerida | Observação |
|------------|-----------------|------------|
| Git | — | — |
| Node.js | 20+ (testado com 24) | [nodejs.org](https://nodejs.org) |
| Flutter | Stable 3.22+ | [docs.flutter.dev](https://docs.flutter.dev/get-started/install) → `flutter doctor` |
| Docker Desktop | atual | Windows: precisa **WSL2** e reinício após instalar |
| PostgreSQL 16 | opcional | Só se não usar Docker |
| Android Studio / Xcode | opcional | Para emulador/device nativo |

---

## Passo a passo (outro desenvolvedor)

### 1. Clonar o projeto

```bash
git clone <url-do-repositorio>
cd AFTER
```

### 2. Subir o banco (PostgreSQL)

Na **raiz** do projeto:

```bash
docker compose up -d
```

Sobe o container `after-postgres`:

| Item | Valor |
|------|--------|
| Host | `localhost` |
| Porta | **5433** (evita conflito com Postgres local na 5432) |
| Usuário | `after` |
| Senha | `after` |
| Database | `after` |

Sem Docker: crie um banco PostgreSQL equivalente e ajuste `DATABASE_URL` no `.env` da API.

### 3. Configurar e subir a API

```bash
cd apps/api
cp .env.example .env
npm install
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
```

API em: **http://localhost:3000**

Teste rápido:

```bash
curl http://localhost:3000/locations/states
```

Deve retornar a lista de UFs (IBGE).

### 4. Subir o app Flutter

Em **outro terminal**:

```bash
cd apps/mobile
flutter pub get
flutter run -d chrome --web-port=8080
```

App em: **http://localhost:8080**

Outras plataformas:

```bash
flutter run                 # Android (device/emulador)
flutter run -d windows      # Desktop Windows
flutter run -d ios          # iOS (somente Mac)
```

### 5. Validar o fluxo

1. Login: `user@after.local` / `senha123`
2. HOME com cidade **São Paulo** → promoções e locais
3. Criar conta → combos de Estado e Cidade
4. Login estabelecimento, ex.: `boteco.central@after.local` / `senha123` → editar local, créditos, publicar banner

---

## Ordem dos serviços

| # | Serviço | Onde | Comando | Porta |
|---|---------|------|---------|-------|
| 1 | Postgres | raiz | `docker compose up -d` | 5433 |
| 2 | API | `apps/api` | `npm run start:dev` | 3000 |
| 3 | App | `apps/mobile` | `flutter run -d chrome --web-port=8080` | 8080 |

A API e o banco precisam estar no ar **antes** do app.

---

## Variáveis de ambiente (API)

Arquivo: `apps/api/.env` (copie de `.env.example`):

```env
PORT=3000
DATABASE_URL="postgresql://after:after@localhost:5433/after?schema=public"
JWT_SECRET="change-me-in-production"
JWT_EXPIRES_IN="7d"
CREDIT_PER_DISPLAY_DAY=1
```

Regra de créditos: **1 crédito = 1 dia de exibição** na HOME.

---

## Contas demo (seed)

```bash
cd apps/api
npm run prisma:seed
```

| Tipo | E-mail | Senha |
|------|--------|-------|
| Usuário | `user@after.local` | `senha123` |
| Estabelecimentos (10) | ex. `boteco.central@after.local` | `senha123` |

Estabelecimentos em **São Paulo**, cada um com promoção do dia:

- Boteco Central — `boteco.central@after.local`
- Sushi Nori — `sushi.nori@after.local`
- Burger Garage — `burger.garage@after.local`
- Café Aurora — `cafe.aurora@after.local`
- Pizzaria Forno Alto — `pizzaria.forno@after.local`
- Casa de Show Luz — `casa.show.luz@after.local`
- Churrasco Gaúcho — `churrasco.gaucho@after.local`
- Açaí Tropical — `acai.tropical@after.local`
- Pasta Roma — `pasta.roma@after.local`
- Lanchonete Express — `lanchonete.express@after.local`

---

## Login Google e Apple

Os botões da tela de login estão ligados à API (`POST /auth/google`, `POST /auth/apple` e fluxo OAuth no navegador).

### Google

1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie um **OAuth Client ID do tipo Web**.
2. Em *Authorized redirect URIs*, adicione:
   `http://localhost:3000/auth/google/callback`
3. Preencha na API (`apps/api/.env`):

```env
GOOGLE_CLIENT_ID="<id>.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="<secret>"
GOOGLE_CLIENT_IDS="<android-client-id>,<ios-client-id>"
```

4. Para login nativo no app, passe no `flutter run`:

```bash
flutter run -d chrome --web-port=8080 --dart-define=GOOGLE_WEB_CLIENT_ID=<id>.apps.googleusercontent.com --dart-define=GOOGLE_SERVER_CLIENT_ID=<id>.apps.googleusercontent.com
```

Contas novas entram como usuário comum, cidade inicial **São Paulo** (dá para trocar depois no perfil).

### Apple

- **iPhone/iPad:** Sign in with Apple nativo (capability já no projeto). No Apple Developer, ative Sign in with Apple no App ID `com.r2p.after.afterApp`.
- **Web/Android:** crie um Service ID e defina `APPLE_SERVICE_ID` + `APPLE_REDIRECT_URI` HTTPS na API.

A API já valida o identity token da Apple com `APPLE_BUNDLE_ID=com.r2p.after.afterApp`.

---

## URL da API no app

Configurado em `apps/mobile/lib/core/config/api_config.dart`:

| Ambiente | Base URL |
|----------|----------|
| Chrome / Windows / iOS simulator | `http://localhost:3000` |
| Emulador Android | `http://10.0.2.2:3000` |

---

## Endpoints principais

| Método | Rota | Auth |
|--------|------|------|
| POST | `/auth/register` | não |
| POST | `/auth/login` | não |
| GET | `/auth/providers` | não |
| POST | `/auth/google` | não (idToken) |
| POST | `/auth/apple` | não (identityToken) |
| GET | `/auth/google/start` | não (OAuth web) |
| GET | `/auth/google/callback` | não |
| GET | `/auth/apple/start` | não (OAuth web) |
| POST | `/auth/apple/callback` | não |
| GET | `/users/me` | JWT |
| GET | `/locations/states` | não |
| GET | `/locations/states/:uf/cities` | não |
| GET | `/home/promotions?city=` | não |
| GET | `/home/venues?city=` | não |
| GET / PUT | `/venues/:id` | PUT com JWT |
| POST | `/venues/:id/photos` | JWT |
| POST | `/uploads` | JWT (multipart `file`) |
| GET / POST / DELETE | `/favorites` | JWT |
| GET | `/credits/wallet` | JWT (venue) |
| GET | `/credits/packages` | JWT |
| POST | `/credits/checkout` | JWT (venue) |
| POST | `/credits/dev-confirm/:purchaseId` | JWT (dev stub) |
| POST | `/banners` | JWT (venue) |
| GET | `/banners/history` | JWT (venue) |

Uploads ficam em `apps/api/uploads` e são servidos em `/uploads/...`.

---

## Scripts úteis (API)

```bash
cd apps/api
npm run start:dev          # desenvolvimento (watch)
npm run build              # build
npm run prisma:migrate     # migrate interativa (dev)
npx prisma migrate deploy  # migrate em ambiente existente
npm run prisma:seed        # dados demo
npm run prisma:studio      # UI do banco
```

---

## Stack

- **Mobile:** Flutter (Dart), Provider, http, shared_preferences, image_picker, fonte Montserrat, logo da marca
- **API:** NestJS, Passport JWT, Prisma 5, PostgreSQL, Multer (upload local)
- **Localidades:** proxy IBGE (`/locations/...`)
- **Monetização (MVP stub):** checkout simulado + `dev-confirm`

---

## Problemas comuns

| Problema | Solução |
|----------|---------|
| Prisma `P1010` / acesso negado | Use porta **5433** no `DATABASE_URL`, não 5432 |
| Docker não inicia (Windows) | Instale WSL2, reinicie o PC, abra o Docker Desktop até ficar *Running* |
| Porta 8080 em uso | Encerre o processo antigo ou use `--web-port=8081` |
| HOME sem promoções | Rode `npm run prisma:seed` e filtre cidade **São Paulo** |
| App Android sem API | No emulador a base é `10.0.2.2` (já configurado); a API precisa estar no ar na máquina host |
| Tela branca no Chrome | Faça hard refresh (`Ctrl+Shift+R`) ou reinicie o `flutter run` |
| Combo Estado/Cidade vazio | Confirme a API em `:3000` e `GET /locations/states` |

---

## Funcionalidades já no esqueleto / MVP

- Auth JWT (usuário e estabelecimento)
- HOME (promoções do dia + locais) com imagens
- Perfis, favoritos, edição do local (horários, contatos, mídia)
- Upload de imagens, compra stub de créditos, publicação de banner
- Combos Estado/Cidade no cadastro (IBGE)
- Branding: logo roxa + Montserrat

## Fora do escopo atual / próximos passos

- Gateway de pagamento real (Mercado Pago / Stripe) e decisão sobre IAP nas lojas
- Storage em cloud (S3 etc.)
- Distância GPS em tempo real
- UI 100% fiel aos prints do PDF
- Builds de loja (App Store / Google Play)
