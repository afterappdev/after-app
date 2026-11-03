# Firebase / APNs — build iOS (Codemagic)

O repositório **não** versiona `GoogleService-Info.plist`. Sem esse arquivo, `Firebase.initializeApp()` falha no iPhone e o push promo não registra token FCM.

## Arquivo esperado

- Caminho no projeto Xcode: `apps/mobile/ios/Runner/GoogleService-Info.plist`
- Origem: Firebase Console → projeto After → app iOS (`com.r2p.after.afterApp`) → baixar plist

## Codemagic (injeção)

1. Guardar o conteúdo do plist como secret de grupo (ex.: `FIREBASE_IOS_PLIST`).
2. Antes de `flutter build ipa`, no diretório `apps/mobile/ios/Runner/`:

```bash
echo "$FIREBASE_IOS_PLIST" > GoogleService-Info.plist
```

3. Confirmar que o target **Runner** inclui o plist em **Copy Bundle Resources** (após primeiro add local no Xcode ou script que registra no `project.pbxproj`).

## Apple Developer

- Capability **Push Notifications** no App ID.
- Chave APNs (.p8) enviada ao Firebase (Cloud Messaging → Apple app configuration).
- Provisioning profile com Push + entitlements `aps-environment` (release/TestFlight: `production`).

## Validação

Push só considerado OK após teste em **dispositivo físico** (não simulador): permissão → token FCM → API recebe registro → notificação abre promoção.
