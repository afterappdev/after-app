import 'dart:convert';
import 'dart:io';

import 'package:fake_async/fake_async.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/core/router/app_router.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/credits/billing_channel.dart';
import 'package:after_app/features/credits/pix_charge.dart';
import 'package:after_app/features/credits/pix_checkout.dart';
import 'package:after_app/features/credits/buy_credits_screen.dart';
import 'package:after_app/features/credits/checkout_screen.dart';
import 'package:after_app/features/credits/credits_ui.dart';
import 'package:after_app/features/credits/pix_pending_reconcile.dart';
import 'package:after_app/features/credits/pix_poller.dart';
import 'package:after_app/features/credits/purchase_labels.dart';
import 'package:after_app/features/credits/store_billing_types.dart';
import 'package:after_app/features/public/legal_agreement_notice.dart';
import 'package:after_app/features/public/privacy_policy_page.dart';
import 'package:after_app/features/public/terms_of_use_page.dart';

const _pack = {
  'key': 'unit_1',
  'credits': 1,
  'priceBrl': 34.9,
  'storeProductId': 'after.credits.1',
};

const _officialPackages = [
  {
    'key': 'unit_1',
    'credits': 1,
    'priceBrl': 34.9,
    'storeProductId': 'after.credits.1',
  },
  {
    'key': 'combo_5',
    'credits': 5,
    'priceBrl': 149.9,
    'storeProductId': 'after.credits.5',
  },
  {
    'key': 'combo_10',
    'credits': 10,
    'priceBrl': 199.9,
    'storeProductId': 'after.credits.10',
  },
];

void main() {
  test('Web não usa in_app_purchase', () {
    expect(
      billingUsesStore(isWeb: true, platform: TargetPlatform.android),
      isFalse,
    );
    expect(
      billingUsesStore(isWeb: true, platform: TargetPlatform.iOS),
      isFalse,
    );
    expect(
      billingUsesPix(isWeb: true, platform: TargetPlatform.android),
      isTrue,
    );
  });

  test('Android não exibe PIX', () {
    expect(
      billingUsesPix(isWeb: false, platform: TargetPlatform.android),
      isFalse,
    );
    expect(
      billingUsesStore(isWeb: false, platform: TargetPlatform.android),
      isTrue,
    );
  });

  test('iOS não exibe PIX', () {
    expect(
      billingUsesPix(isWeb: false, platform: TargetPlatform.iOS),
      isFalse,
    );
    expect(
      billingUsesStore(isWeb: false, platform: TargetPlatform.iOS),
      isTrue,
    );
  });

  test('frontend não adiciona créditos sozinho', () {
    final body = pixCreateBody('combo_10');
    expect(body, {'packageKey': 'combo_10'});
    expect(body.containsKey('credits'), isFalse);
    expect(body.containsKey('status'), isFalse);
    expect(body.containsKey('amount'), isFalse);
    expect(body.containsKey('priceBrl'), isFalse);
    expect(walletBalanceFromResponse({'balance': 3, 'credits': 99}), 3);
    expect(PixCharge.fromResponse({'credits': 10}).amount, isNull);
    expect(PixCharge.fromResponse({}).qrCodeText, isNull);
    expect(PixCharge.fromResponse({}).qrCodeImage, isNull);
    expect(
      friendlyPixErrorFrom(
        statusCode: 503,
        message: 'PIX payment provider is not configured',
      ),
      'Pagamento por PIX ainda não está disponível.',
    );
  });

  test('Product IDs nativos e chaves de pacote permanecem os mesmos', () {
    expect(storeProductIdFor('unit_1'), 'after.credits.1');
    expect(storeProductIdFor('combo_5'), 'after.credits.5');
    expect(storeProductIdFor('combo_10'), 'after.credits.10');
    expect(_officialPackages.map((p) => p['key']), [
      'unit_1',
      'combo_5',
      'combo_10',
    ]);
    expect(_officialPackages.map((p) => p['credits']), [1, 5, 10]);
    expect(_officialPackages.map((p) => p['storeProductId']), [
      'after.credits.1',
      'after.credits.5',
      'after.credits.10',
    ]);
  });

  test('preço por crédito e economia usam a tabela oficial', () {
    final unit = _officialPackages[0];
    final combo5 = _officialPackages[1];
    final combo10 = _officialPackages[2];

    expect(formatBrl(asMoney(unit['priceBrl'])), 'R\$ 34,90');
    expect(formatBrl(asMoney(combo5['priceBrl'])), 'R\$ 149,90');
    expect(formatBrl(asMoney(combo10['priceBrl'])), 'R\$ 199,90');
    expect(
      formatBrl(asMoney(combo5['priceBrl']) / asInt(combo5['credits'])),
      'R\$ 29,98',
    );
    expect(
      formatBrl(asMoney(combo10['priceBrl']) / asInt(combo10['credits'])),
      'R\$ 19,99',
    );
    expect(packageSavings(unit, _officialPackages), isNull);
    expect(packageSavings(combo5, _officialPackages), closeTo(24.6, 0.001));
    expect(packageSavings(combo10, _officialPackages), closeTo(149.1, 0.001));
    expect(formatBrl(packageSavings(combo5, _officialPackages)!), 'R\$ 24,60');
    expect(formatBrl(packageSavings(combo10, _officialPackages)!), 'R\$ 149,10');
    expect(formatBrl(25), isNot('R\$ 34,90'));
    expect(formatBrl(115), isNot('R\$ 149,90'));
    expect(formatBrl(200), isNot('R\$ 199,90'));
  });

  test('polling para em status final', () {
    fakeAsync((async) {
      var fetches = 0;
      final poller = PixPurchasePoller(
        fetchStatus: (id) async {
          fetches += 1;
          expect(id, 'p1');
          return fetches >= 2 ? 'PAID' : 'PENDING';
        },
        interval: const Duration(seconds: 4),
      );
      final seen = <String>[];
      poller.start(purchaseId: 'p1', onStatus: seen.add);
      async.flushMicrotasks();
      expect(seen, ['PENDING']);
      expect(poller.isActive, isTrue);

      async.elapse(const Duration(seconds: 4));
      async.flushMicrotasks();
      expect(seen, ['PENDING', 'PAID']);
      expect(poller.isActive, isFalse);

      final afterStop = fetches;
      async.elapse(const Duration(seconds: 20));
      async.flushMicrotasks();
      expect(fetches, afterStop);
      poller.dispose();
    });
  });

  test('polling para em dispose', () {
    fakeAsync((async) {
      var fetches = 0;
      final poller = PixPurchasePoller(
        fetchStatus: (_) async {
          fetches += 1;
          return 'PENDING';
        },
        interval: const Duration(seconds: 4),
      );
      poller.start(purchaseId: 'p1', onStatus: (_) {});
      async.flushMicrotasks();
      expect(fetches, 1);
      poller.dispose();
      expect(poller.isActive, isFalse);
      async.elapse(const Duration(seconds: 30));
      async.flushMicrotasks();
      expect(fetches, 1);
    });
  });

  testWidgets('503 do PIX mostra mensagem amigável', (tester) async {
    final paths = <String>[];
    final client = MockClient((request) async {
      paths.add('${request.method} ${request.url.path}');
      if (request.url.path.endsWith('/credits/pix/create')) {
        return http.Response(
          jsonEncode({'message': 'PIX payment provider is not configured'}),
          503,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });

    await tester.pumpWidget(
      Provider.value(
        value: ApiClient(client: client),
        child: MaterialApp(
          home: PixCheckoutScreen(pack: Map<String, dynamic>.from(_pack)),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('fiscal-generate-pix')));
    await tester.tap(find.byKey(const Key('fiscal-generate-pix')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 50));

    expect(paths, contains('POST /credits/pix/create'));
    expect(
      find.text('Pagamento por PIX ainda não está disponível.'),
      findsOneWidget,
    );
    expect(find.textContaining('not configured'), findsNothing);
    expect(paths.any((p) => p.contains('dev-confirm')), isFalse);
  });

  testWidgets('PIX envia invoiceRequested false por padrão', (tester) async {
    String? body;
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/credits/pix/create')) {
        body = request.body;
        return http.Response(
          jsonEncode({
            'purchaseId': 'p-fiscal',
            'status': 'PENDING',
            'qrCodeText': '00020126copia',
          }),
          201,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.url.path.endsWith('/credits/purchases/p-fiscal')) {
        return http.Response(
          jsonEncode({'id': 'p-fiscal', 'status': 'PENDING'}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });

    await tester.pumpWidget(
      Provider.value(
        value: ApiClient(client: client),
        child: MaterialApp(
          home: PixCheckoutScreen(pack: Map<String, dynamic>.from(_pack)),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    await tester.tap(find.byKey(const Key('fiscal-generate-pix')));
    await tester.pump();
    await tester.pump();

    final payload = jsonDecode(body!) as Map<String, dynamic>;
    expect(payload['packageKey'], 'unit_1');
    expect(payload['invoiceRequested'], isFalse);
    expect(payload.containsKey('fiscalDocument'), isFalse);
    expect(payload.containsKey('fiscalName'), isFalse);
  });

  testWidgets('Web não chama dev-confirm', (tester) async {
    final paths = <String>[];
    final client = MockClient((request) async {
      paths.add('${request.method} ${request.url.path}');
      return http.Response(
        jsonEncode({'message': 'PIX payment provider is not configured'}),
        503,
        headers: {'content-type': 'application/json'},
      );
    });

    await tester.pumpWidget(
      Provider.value(
        value: ApiClient(client: client),
        child: MaterialApp(
          home: PixCheckoutScreen(pack: Map<String, dynamic>.from(_pack)),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(paths.where((p) => p.contains('dev-confirm')), isEmpty);
    expect(paths.where((p) => p.contains('/credits/checkout')), isEmpty);
  });

  testWidgets('saldo é recarregado após PAID', (tester) async {
    var walletReads = 0;
    final client = MockClient((request) async {
      final path = request.url.path;
      expect(path.contains('dev-confirm'), isFalse);
      if (path.endsWith('/credits/pix/create')) {
        return http.Response(
          jsonEncode({
            'purchase': {'id': 'p1', 'status': 'PENDING'},
          }),
          201,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path.endsWith('/credits/purchases/p1')) {
        return http.Response(
          jsonEncode({'id': 'p1', 'status': 'PAID', 'credits': 1}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path.endsWith('/credits/wallet')) {
        walletReads += 1;
        return http.Response(
          jsonEncode({'venueId': 'v1', 'balance': 12}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });

    await tester.pumpWidget(
      Provider.value(
        value: ApiClient(client: client),
        child: MaterialApp(
          home: PixCheckoutScreen(pack: Map<String, dynamic>.from(_pack)),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    await tester.tap(find.byKey(const Key('fiscal-generate-pix')));
    await tester.pump();
    await tester.pump();
    await tester.pump();

    expect(find.text('Pagamento confirmado'), findsOneWidget);
    expect(find.text('Saldo atual: 12'), findsOneWidget);
    expect(walletReads, 1);
    expect(find.text('Saldo atual: 1'), findsNothing);
  });

  test('rótulos de provedor e status', () {
    expect(purchaseProviderLabel('google_play'), 'Google Play');
    expect(purchaseProviderLabel('app_store'), 'App Store');
    expect(purchaseProviderLabel('apple_app_store'), 'App Store');
    expect(purchaseProviderLabel('pix'), 'PIX');
    expect(purchaseProviderLabel('stub'), 'Desenvolvimento');
    expect(purchaseStatusLabel('PENDING'), 'Aguardando pagamento');
    expect(purchaseStatusLabel('PAID'), 'Pago');
    expect(purchaseStatusLabel('FAILED'), 'Falhou');
    expect(purchaseStatusLabel('CANCELLED'), 'Cancelado');
    expect(purchaseStatusLabel('REFUNDED'), 'Reembolsado');
    expect(isTerminalPurchaseStatus('PENDING'), isFalse);
    expect(isTerminalPurchaseStatus('PAID'), isTrue);
  });

  test('lista reconcilia só PIX PENDING via GET :id', () async {
    final fetched = <String>[];
    final result = await reconcilePendingPixPurchases(
      purchases: [
        {
          'id': 'pix-pending',
          'provider': 'pix',
          'status': 'PENDING',
          'credits': 1,
        },
        {
          'id': 'pix-paid',
          'provider': 'pix',
          'status': 'PAID',
          'credits': 1,
        },
        {
          'id': 'pix-failed',
          'provider': 'pix',
          'status': 'FAILED',
          'credits': 1,
        },
        {
          'id': 'pix-cancelled',
          'provider': 'pix',
          'status': 'CANCELLED',
          'credits': 1,
        },
        {
          'id': 'pix-refunded',
          'provider': 'pix',
          'status': 'REFUNDED',
          'credits': 1,
        },
        {
          'id': 'gp-pending',
          'provider': 'google_play',
          'status': 'PENDING',
          'credits': 1,
        },
        {
          'id': 'apple-pending',
          'provider': 'app_store',
          'status': 'PENDING',
          'credits': 1,
        },
        {
          'id': 'stub-pending',
          'provider': 'stub',
          'status': 'PENDING',
          'credits': 1,
        },
      ],
      fetchById: (id) async {
        fetched.add(id);
        return {'id': id, 'status': 'PAID', 'provider': 'pix'};
      },
    );
    expect(fetched, ['pix-pending']);
    expect(result.fetchedIds, ['pix-pending']);
    expect(result.anyBecamePaid, isTrue);
    expect(
      (result.purchases[0] as Map)['status'],
      'PAID',
    );
    expect((result.purchases[1] as Map)['status'], 'PAID');
    expect((result.purchases[2] as Map)['status'], 'FAILED');
    expect((result.purchases[3] as Map)['status'], 'CANCELLED');
    expect((result.purchases[4] as Map)['status'], 'REFUNDED');
    expect((result.purchases[5] as Map)['status'], 'PENDING');
    expect((result.purchases[6] as Map)['provider'], 'app_store');
  });

  test('erro 500 no poller não encerra o fluxo', () {
    fakeAsync((async) {
      var fetches = 0;
      final poller = PixPurchasePoller(
        fetchStatus: (_) async {
          fetches += 1;
          throw ApiException('Mercado Pago down', statusCode: 500);
        },
        interval: const Duration(seconds: 4),
      );
      var fatal = 0;
      poller.start(
        purchaseId: 'p1',
        onStatus: (_) {},
        onFatalError: (_) => fatal += 1,
      );
      async.flushMicrotasks();
      expect(poller.isActive, isTrue);
      expect(fatal, 0);
      async.elapse(const Duration(seconds: 8));
      async.flushMicrotasks();
      expect(fetches, greaterThan(1));
      expect(poller.isActive, isTrue);
      expect(fatal, 0);
      poller.dispose();
    });
  });

  test('erro de rede temporário no poller não encerra o fluxo', () {
    fakeAsync((async) {
      var fetches = 0;
      final poller = PixPurchasePoller(
        fetchStatus: (_) async {
          fetches += 1;
          throw Exception('Connection timed out');
        },
        interval: const Duration(seconds: 4),
      );
      var fatal = 0;
      poller.start(
        purchaseId: 'p1',
        onStatus: (_) {},
        onFatalError: (_) => fatal += 1,
      );
      async.flushMicrotasks();
      async.elapse(const Duration(seconds: 8));
      async.flushMicrotasks();
      expect(fetches, greaterThan(1));
      expect(poller.isActive, isTrue);
      expect(fatal, 0);
      poller.dispose();
    });
  });

  test('404 no poller para e notifica erro fatal', () {
    fakeAsync((async) {
      var fetches = 0;
      final poller = PixPurchasePoller(
        fetchStatus: (_) async {
          fetches += 1;
          throw ApiException('Compra não encontrada', statusCode: 404);
        },
        interval: const Duration(seconds: 4),
      );
      Object? fatal;
      poller.start(
        purchaseId: 'p1',
        onStatus: (_) {},
        onFatalError: (error) => fatal = error,
      );
      async.flushMicrotasks();
      expect(poller.isActive, isFalse);
      expect(fatal, isA<ApiException>());
      expect((fatal as ApiException).statusCode, 404);
      async.elapse(const Duration(seconds: 12));
      async.flushMicrotasks();
      expect(fetches, 1);
      poller.dispose();
    });
  });

  test('sanitizeClientError não vaza JWT nem Bearer', () {
    final sanitized = sanitizeClientError(
      ApiException(
        'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb failed',
        statusCode: 401,
      ),
    );
    expect(sanitized.contains('eyJ'), isFalse);
    expect(sanitized.toLowerCase().contains('bearer eyj'), isFalse);
    expect(sanitized.contains('[redacted]'), isTrue);
  });

  testWidgets('tela Comprar créditos mostra tabela oficial e total do pacote',
      (tester) async {
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final client = MockClient((request) async {
      final path = request.url.path;
      if (path.endsWith('/credits/wallet')) {
        return http.Response(
          jsonEncode({'venueId': 'v1', 'balance': 0}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path.endsWith('/credits/packages')) {
        return http.Response(
          jsonEncode(_officialPackages),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path == '/credits/purchases') {
        return http.Response(
          jsonEncode(<dynamic>[]),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });

    await tester.pumpWidget(
      Provider.value(
        value: ApiClient(client: client),
        child: const MaterialApp(
          home: BuyCreditsScreen(
            reconcilePendingPix: false,
            usePixCheckout: true,
          ),
        ),
      ),
    );
    await _pumpCredits(tester);

    expect(find.text('1 crédito'), findsOneWidget);
    expect(find.text('5 créditos'), findsOneWidget);
    expect(find.text('10 créditos'), findsOneWidget);
    expect(find.text('R\$ 34,90'), findsWidgets);
    expect(find.text('R\$ 149,90'), findsOneWidget);
    expect(find.text('R\$ 199,90'), findsWidgets);
    expect(find.text('R\$ 34,90 por crédito'), findsOneWidget);
    expect(find.text('R\$ 29,98 por crédito'), findsOneWidget);
    expect(find.text('R\$ 19,99 por crédito'), findsOneWidget);
    expect(find.text('Economize R\$ 24,60'), findsOneWidget);
    expect(find.text('Economize R\$ 149,10'), findsOneWidget);
    expect(find.text('Total: R\$ 199,90'), findsOneWidget);
    expect(find.text('R\$ 25,00'), findsNothing);
    expect(find.text('R\$ 115,00'), findsNothing);
    expect(find.text('R\$ 200,00'), findsNothing);
    expect(find.text('Economize R\$ 10,00'), findsNothing);
    expect(find.text('Economize R\$ 50,00'), findsNothing);

    await tester.tap(find.text('1 crédito'));
    await tester.pump();
    expect(find.text('Total: R\$ 34,90'), findsOneWidget);

    await tester.tap(find.text('5 créditos'));
    await tester.pump();
    expect(find.text('Total: R\$ 149,90'), findsOneWidget);
  });

  testWidgets('lista PIX PENDING chama GET :id, ignora finais e lojas, recarrega wallet',
      (tester) async {
    final paths = <String>[];
    var walletReads = 0;
    final client = MockClient((request) async {
      final path = request.url.path;
      paths.add('${request.method} $path');
      expect(path.contains('dev-confirm'), isFalse);
      if (path.endsWith('/credits/wallet')) {
        walletReads += 1;
        return http.Response(
          jsonEncode({'venueId': 'v1', 'balance': walletReads == 1 ? 0 : 4}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path.endsWith('/credits/packages')) {
        return http.Response(
          jsonEncode([_pack]),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path == '/credits/purchases') {
        return http.Response(
          jsonEncode([
            {
              'id': 'pix-pending',
              'provider': 'pix',
              'status': 'PENDING',
              'credits': 1,
              'amountPaid': 34.9,
            },
            {
              'id': 'pix-paid',
              'provider': 'pix',
              'status': 'PAID',
              'credits': 1,
              'amountPaid': 34.9,
            },
            {
              'id': 'gp-1',
              'provider': 'google_play',
              'status': 'PAID',
              'credits': 1,
              'amountPaid': 34.9,
            },
            {
              'id': 'ap-1',
              'provider': 'app_store',
              'status': 'PAID',
              'credits': 1,
              'amountPaid': 34.9,
            },
          ]),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path.endsWith('/credits/purchases/pix-pending')) {
        return http.Response(
          jsonEncode({
            'id': 'pix-pending',
            'provider': 'pix',
            'status': 'PAID',
            'credits': 1,
            'amountPaid': 34.9,
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });

    await tester.pumpWidget(
      Provider.value(
        value: ApiClient(client: client),
        child: const MaterialApp(
          home: BuyCreditsScreen(
            reconcilePendingPix: true,
            usePixCheckout: true,
          ),
        ),
      ),
    );
    await _pumpCredits(tester);

    expect(paths, contains('GET /credits/purchases/pix-pending'));
    expect(paths.where((p) => p.contains('/credits/purchases/pix-paid')), isEmpty);
    expect(paths.where((p) => p.contains('/credits/purchases/gp-1')), isEmpty);
    expect(paths.where((p) => p.contains('/credits/purchases/ap-1')), isEmpty);
    expect(find.text('Pago'), findsWidgets);
    expect(find.text('Aguardando pagamento'), findsNothing);
    expect(find.text('4'), findsOneWidget);
    expect(walletReads, 2);
    expect(paths.where((p) => p.contains('dev-confirm')), isEmpty);
  });

  testWidgets('voltar do checkout força refresh de histórico e wallet',
      (tester) async {
    var purchaseListReads = 0;
    var walletReads = 0;
    final client = MockClient((request) async {
      final path = request.url.path;
      expect(path.contains('dev-confirm'), isFalse);
      if (path.endsWith('/credits/wallet')) {
        walletReads += 1;
        return http.Response(
          jsonEncode({'venueId': 'v1', 'balance': 0}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path.endsWith('/credits/packages')) {
        return http.Response(
          jsonEncode([_pack]),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path == '/credits/purchases') {
        purchaseListReads += 1;
        return http.Response(
          jsonEncode(<dynamic>[]),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path.endsWith('/credits/pix/create')) {
        return http.Response(
          jsonEncode({
            'purchaseId': 'p-new',
            'status': 'PENDING',
            'qrCodeText': '00020126copia',
          }),
          201,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path.endsWith('/credits/purchases/p-new')) {
        return http.Response(
          jsonEncode({'id': 'p-new', 'status': 'PENDING'}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });

    await tester.pumpWidget(
      Provider.value(
        value: ApiClient(client: client),
        child: const MaterialApp(
          home: BuyCreditsScreen(
            reconcilePendingPix: true,
            usePixCheckout: true,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(purchaseListReads, 1);
    expect(walletReads, 1);

    await tester.tap(find.text('Continuar para pagamento'));
    await tester.pump();
    await tester.pump();
    expect(find.text('Pagar com PIX'), findsWidgets);

    await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded).last);
    await tester.pump();
    await tester.pump();
    await tester.pump();

    expect(purchaseListReads, 2);
    expect(walletReads, 2);
  });

  testWidgets('404 no checkout mostra erro amigável e para o polling',
      (tester) async {
    var purchaseGets = 0;
    final client = MockClient((request) async {
      final path = request.url.path;
      if (path.endsWith('/credits/pix/create')) {
        return http.Response(
          jsonEncode({
            'purchaseId': 'missing',
            'status': 'PENDING',
            'qrCodeText': '00020126copia',
          }),
          201,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path.endsWith('/credits/purchases/missing')) {
        purchaseGets += 1;
        return http.Response(
          jsonEncode({'message': 'Compra não encontrada'}),
          404,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });

    await tester.pumpWidget(
      Provider.value(
        value: ApiClient(client: client),
        child: MaterialApp(
          home: PixCheckoutScreen(pack: Map<String, dynamic>.from(_pack)),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    await tester.tap(find.byKey(const Key('fiscal-generate-pix')));
    await tester.pump();
    await tester.pump();
    await tester.pump();

    expect(
      find.text('Não encontramos essa compra. Volte e tente novamente.'),
      findsOneWidget,
    );
    final afterFirst = purchaseGets;
    await tester.pump(const Duration(seconds: 4));
    expect(purchaseGets, afterFirst);
  });

  test('checkout nativo usa links de Termos e Política', () {
    final src = File(
      'lib/features/credits/checkout_screen.dart',
    ).readAsStringSync();
    expect(src.contains('LegalAgreementNotice'), isTrue);
    expect(src.contains('legal_agreement_notice.dart'), isTrue);
  });

  testWidgets('checkout IAP abre Termos sem quebrar o pagamento', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});

    final api = ApiClient(
      client: MockClient((_) async => http.Response('{}', 200)),
    );
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false;

    tester.view.physicalSize = const Size(400, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider.value(value: api),
          ChangeNotifierProvider.value(value: auth),
        ],
        child: MaterialApp(
          home: CheckoutScreen(pack: Map<String, dynamic>.from(_pack)),
          routes: {
            AppRoutes.terms: (_) => const TermsOfUsePage(),
            AppRoutes.privacy: (_) => const PrivacyPolicyPage(),
          },
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    tester.takeException();

    expect(find.byType(CheckoutScreen), findsOneWidget);
    expect(find.byType(LegalAgreementNotice), findsOneWidget);
    expect(find.textContaining('Pagar com'), findsOneWidget);

    await tester.ensureVisible(find.byKey(const Key('legal-terms-link')));
    await tester.tap(find.byKey(const Key('legal-terms-link')));
    await tester.pumpAndSettle();
    expect(find.byType(TermsOfUsePage), findsOneWidget);

    Navigator.of(tester.element(find.byType(TermsOfUsePage))).pop();
    await tester.pumpAndSettle();
    expect(find.byType(CheckoutScreen), findsOneWidget);
    expect(find.byType(LegalAgreementNotice), findsOneWidget);
    expect(find.textContaining('Pagar com'), findsOneWidget);

    await tester.ensureVisible(find.byKey(const Key('legal-privacy-link')));
    await tester.tap(find.byKey(const Key('legal-privacy-link')));
    await tester.pumpAndSettle();
    expect(find.byType(PrivacyPolicyPage), findsOneWidget);
  });
}

Future<void> _pumpCredits(WidgetTester tester) async {
  await tester.pump();
  tester.takeException();
  await tester.pump();
  tester.takeException();
  await tester.pump();
  tester.takeException();
}
