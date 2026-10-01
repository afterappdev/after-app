import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  late String page;
  late String shell;

  setUpAll(() {
    page = File('web/baixar/index.html').readAsStringSync();
    shell = File('web/index.html').readAsStringSync();
  });

  test('metadados e textos da página /baixar', () {
    expect(page, contains('<title>After - O que tem pra hoje?</title>'));
    expect(
      page,
      contains(
        'content="Descubra bares, restaurantes, pubs, eventos e muito mais perto de você."',
      ),
    );
    expect(page, contains('O que tem'));
    expect(page, contains('pra hoje?'));
    expect(
      page,
      contains('Descubra bares, restaurantes, pubs,<br>eventos e muito mais perto de você.'),
    );
    expect(page, contains('BAIXE PELO'));
    expect(page, contains('Google Play'));
    expect(page, contains('BAIXE PELA'));
    expect(page, contains('App Store'));
    expect(page, contains('Acessar pelo'));
    expect(page, contains('navegador'));
    expect(page, contains('Falar conosco'));
    expect(page, contains('pelo WhatsApp'));
    expect(page, contains('© 2026 After. Todos os direitos reservados.'));
    expect(page, contains('logo_after.png'));
    expect(page, contains('name="after-download-page"'));
  });

  test('lojas ficam sem URL e os destinos fixos estão corretos', () {
    expect(page, contains("const googlePlayUrl = '';"));
    expect(page, contains("const appStoreUrl = '';"));
    expect(page, contains('href="https://app-after.com.br"'));
    expect(page, contains('href="https://wa.me/5517996470194"'));
    expect(page.contains('play.google.com'), isFalse);
    expect(page.contains('apps.apple.com'), isFalse);
    expect(page.contains('itunes.apple.com'), isFalse);
    expect(page.contains('wa.me/5517996470194?'), isFalse);
    expect(page.contains('instagram.com'), isFalse);
    expect(page.contains('facebook.com'), isFalse);
    expect(page.contains('tiktok.com'), isFalse);
  });

  test('o shell do app só desvia /baixar e continua carregando o Flutter', () {
    expect(shell, contains("normalize(location.pathname) !== '/baixar'"));
    expect(shell, contains("fetch('/baixar/index.html'"));
    expect(shell, contains("script.src = 'flutter_bootstrap.js'"));
    expect(
      shell,
      contains('content="width=device-width, initial-scale=1.0"'),
    );
    expect(shell.contains('touch-action'), isFalse);
  });
}
