# Firebase iOS — Codemagic (Workflow Editor)

O repositório **não** versiona `GoogleService-Info.plist`. O app usa `firebase_core` / `firebase_messaging` e precisa do plist no bundle **Runner**.

Variável no Codemagic (já cadastrada):

- **`FIREBASE_IOS_PLIST_BASE64`** — conteúdo completo do plist em Base64 (sem quebras de linha extras).

Bundle ID exigido: **`com.r2p.after.afterApp`**.

## O que o repositório faz

1. Script `ios/scripts/inject-firebase-plist.sh` decodifica a variável para `ios/Runner/GoogleService-Info.plist`.
2. Valida plist (`plutil`) e `BUNDLE_ID` (não imprime o arquivo).
3. Build phase Xcode **Inject Firebase Plist** executa o script antes do build Flutter.
4. `GoogleService-Info.plist` está em **Copy Bundle Resources** do target Runner (`project.pbxproj`).

## Workflow Editor — configurar

**Application settings → Environment variables**

| Nome | Valor | Secure |
|------|--------|--------|
| `FIREBASE_IOS_PLIST_BASE64` | (Base64 do plist) | Sim |

**Build → Pre-build script** (opcional, recomendado — falha cedo antes do `flutter build`):

Working directory: `apps/mobile/ios`

```bash
chmod +x scripts/inject-firebase-plist.sh
./scripts/inject-firebase-plist.sh
```

Se omitir o pre-build, a fase **Inject Firebase Plist** no Xcode ainda roda durante `flutter build ipa` (desde que `CM_BUILD_ID` exista e a variável esteja definida).

**Build → Build** (inalterado em relação ao fluxo Flutter usual), por exemplo:

```bash
cd apps/mobile
flutter pub get
flutter build ipa --release
```

Ajuste flags/signing conforme o workflow já existente.

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
