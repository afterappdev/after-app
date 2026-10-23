# After Admin na Web

Build independente de `apps/admin_mobile`. A saída fica em `apps/admin_mobile/build/web` e deve ser publicada no prefixo `/admin/` do site estático. Não copiar esses arquivos para `apps/mobile/web` nem para a raiz do site público.

O host atual de `https://app-after.com.br` entrega pastas reais e responde 404 para caminhos desconhecidos. `/baixar` redireciona para `/baixar/`. O Admin usa o mesmo modelo: o documento é `/admin/` e as telas ficam no fragmento (`/admin/#/contas`). Assim o refresh não depende de uma regra nova de rewrite e não cai no aplicativo público.

## Gerar o build

Na pasta `apps/admin_mobile`, sem `--dart-define` de segredo:

```bash
flutter build web --release --base-href /admin/
```

Debug local, contra a API em `http://127.0.0.1:3000`:

```bash
flutter run -d chrome --web-port=7360
```

Para apontar o debug a outra API:

```bash
flutter run -d chrome --dart-define=API_BASE_URL=http://127.0.0.1:3000
```

O release sem `API_BASE_URL` usa `https://api.app-after.com.br`.

## Publicar

Enviar o conteúdo de `build/web` para o prefixo `/admin/` do mesmo site estático, ao lado de `/baixar/`. Não substituir `index.html`, `flutter_bootstrap.js` nem os assets da raiz.

Depois da publicação, estes endereços devem responder o Admin:

- `https://app-after.com.br/admin/`
- `https://app-after.com.br/admin/#/dashboard`
- `https://app-after.com.br/admin/#/contas`
- `https://app-after.com.br/admin/#/vendas`
- `https://app-after.com.br/admin/#/cupons`
- `https://app-after.com.br/admin/#/denuncias`
- `https://app-after.com.br/admin/#/perfil`

`/admin` sem barra deve passar a redirecionar para `/admin/`, como já acontece com `/baixar`. Não criar um rewrite de `/admin/*` para `index.html`: isso impediria o carregamento de JS, CSS e fontes. O fragmento não é enviado ao servidor.

A raiz e `/baixar/` permanecem o aplicativo público.

## Atualizar

1. Gerar um novo `build/web` com o mesmo comando da seção anterior.
2. Guardar uma cópia da pasta `/admin/` que está no ar, com data no nome, fora do site público.
3. Substituir somente o conteúdo de `/admin/` pela nova `build/web`.
4. Abrir `/admin/` e um fragmento, por exemplo `/admin/#/contas`, e confirmar que o login do Admin aparece sem misturar o aplicativo público.

Não é preciso alterar a API, o aplicativo público nem a pasta `/baixar/`.

## Reverter

1. Tirar do ar a pasta `/admin/` que acabou de ser publicada.
2. Recolocar a cópia guardada no mesmo prefixo `/admin/`.
3. Confirmar `/admin/` e `/admin/#/dashboard`.

Se a publicação ainda não tinha uma cópia anterior, apagar `/admin/` devolve o 404 antigo e não altera a raiz nem `/baixar/`.
