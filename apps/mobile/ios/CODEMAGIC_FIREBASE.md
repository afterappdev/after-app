# Firebase iOS — Codemagic (Workflow Editor)

O repositório **não** versiona `GoogleService-Info.plist`. O app usa `firebase_core` / `firebase_messaging` e precisa do plist **dentro do bundle Runner**.

Variável no Codemagic (já cadastrada):

- **`FIREBASE_IOS_PLIST_BASE64`** — conteúdo completo do plist em Base64 (sem quebras de linha extras).

Bundle ID exigido: **`com.r2p.after.afterApp`**.

## Por que pre-build é obrigatório

O plist **não** está em **Copy Bundle Resources** (evita erro do Xcode *Build input file cannot be found* quando o arquivo não existe no checkout). Em vez disso:

1. **Pre-build** (Codemagic) ou fase **Inject Firebase Plist** gera `Runner/GoogleService-Info.plist` no disco.
2. Fase **Copy Firebase Plist to Bundle** copia o arquivo para `Runner.app` durante o build Xcode.

Sem pre-build, a fase Inject ainda roda no Xcode, mas o pre-build falha cedo se a variável estiver ausente e garante o arquivo antes de `flutter build ipa`.

## Scripts

| Script | Função |
|--------|--------|
| `ios/scripts/inject-firebase-plist.sh` | Decodifica Base64, valida plist (`plutil`) e `BUNDLE_ID` (sem logar conteúdo). |
| `ios/scripts/codemagic-prebuild-firebase.sh` | Wrapper para pre-build no CI. |
| `ios/scripts/copy-firebase-plist-to-bundle.sh` | Copia plist para o bundle (fase Xcode). |

## Workflow Editor — configurar

**Application settings → Environment variables**

| Nome | Valor | Secure |
|------|--------|--------|
| `FIREBASE_IOS_PLIST_BASE64` | (Base64 do plist) | Sim |

**Build → Pre-build script** (**obrigatório**)

Working directory: `apps/mobile/ios`

```bash
chmod +x scripts/codemagic-prebuild-firebase.sh scripts/inject-firebase-plist.sh scripts/copy-firebase-plist-to-bundle.sh
./scripts/codemagic-prebuild-firebase.sh
```

Alternativa com working directory na raiz do repositório:

```bash
chmod +x apps/mobile/ios/scripts/codemagic-prebuild-firebase.sh apps/mobile/ios/scripts/inject-firebase-plist.sh
cd apps/mobile/ios && ./scripts/codemagic-prebuild-firebase.sh
```

**Build → Build** (fluxo Flutter usual), por exemplo:

```bash
cd apps/mobile
flutter pub get
flutter build ipa --release
```

Ajuste flags/signing conforme o workflow já existente.

## Fases Xcode (target Runner)

Ordem: **Inject Firebase Plist** → Run Script (Flutter) → … → Resources → **Copy Firebase Plist to Bundle** → Embed Frameworks → Thin Binary.

Referência do plist permanece no grupo Runner (IDE); inclusão no `.app` é feita pela fase de cópia.

## Build local (macOS)

Coloque `Runner/GoogleService-Info.plist` manualmente **ou** exporte `FIREBASE_IOS_PLIST_BASE64` e rode:

```bash
cd apps/mobile/ios
./scripts/inject-firebase-plist.sh
```

Arquivo está no `.gitignore` — nunca commitar.

## Apple / Firebase

- Push capability + profile com `aps-environment` **production** para TestFlight (ver `Runner.entitlements`).
- APNs (dev/prod) configuradas no Firebase Console.

## Validação

Push só **OK** após teste em iPhone físico: permissão → token FCM → API → toque abre promoção.
