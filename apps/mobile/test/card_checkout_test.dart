import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/credits/billing_channel.dart';
import 'package:after_app/features/credits/card_brick_host.dart';
import 'package:after_app/features/credits/card_pay.dart';
import 'package:after_app/features/credits/checkout_screen.dart';
import 'package:after_app/features/credits/pix_pending_reconcile.dart';
import 'package:after_app/features/credits/pix_poller.dart';
import 'package:after_app/features/credits/web_checkout_screen.dart';

const _pack = {
  'key': 'unit_1',
  'credits': 1,
  'priceBrl': 34.9,
  'storeProductId': 'after.credits.1',
};

const _tokenA = 'tok_test_519ada5ac7431ef6ce24';
const _tokenB = 'tok_test_abcdef0123456789abcd';

void main() {
  test('chave de idempotência e corpo do cartão não levam preço do navegador', () {
    final key = createCardIdempotencyKey(Random(4));
    expect(RegExp(r'^[A-Za-z0-9_-]{16,64}$').hasMatch(key), isTrue);
    final body = cardPayBody(
      packageKey: 'combo_5',
      idempotencyKey: key,
      token: _tokenA,
      paymentMethodId: 'visa',
      fiscal: {'invoiceRequested': false},
    );
    expect(body['paymentType'], 'credit_card');
    expect(body['installments'], 1);
    expect(body.containsKey('amount'), isFalse);
    expect(body.containsKey('priceBrl'), isFalse);
    expect(body.containsKey('transaction_amount'), isFalse);
    expect(redactCardSecrets('falha $_tokenA no provedor'), 'falha no provedor');
  });

  test('resultado desconhecido ou divergente não aprova', () {
    final current = CardAttempt(idempotencyKey: 'a' * 16, phase: CardAttemptPhase.submitting);
    final missingOutcome = applyCardPayResult(
      current,
      const CardPayResult(purchaseId: 'p1', status: 'PAID', outcome: 'mystery'),
    );
    expect(missingOutcome.attempt.phase, CardAttemptPhase.unknown);
    expect(missingOutcome.poll, isFalse);
    expect(missingOutcome.attempt.acceptsSubmit, isFalse);
    expect(missingOutcome.reloadWallet, isFalse);

    final approved = applyCardPayResult(
      current,
      const CardPayResult(purchaseId: 'p1', status: 'PAID', outcome: 'approved'),
    );
    expect(approved.reloadWallet, isTrue);
    expect(approved.attempt.phase, CardAttemptPhase.approved);

    final lost = applyCardHttpFailure(
      current,
      ApiException('timed out'),
    );
    expect(lost.attempt.phase, CardAttemptPhase.unknown);
    expect(lost.attempt.acceptsSubmit, isFalse);
    expect(lost.attempt.message, cardCommunicationMessage);
    expect(lost.poll, isFalse);

    final pending = applyCardPayResult(
      current,
      const CardPayResult(
        purchaseId: 'p1',
        status: 'PENDING',
        outcome: 'pending',
        orderId: 'ORD01CARD',
      ),
    );
    expect(pending.poll, isTrue);
    expect(pending.attempt.phase, CardAttemptPhase.pending);
    expect(pending.reloadWallet, isFalse);

    final unconfirmed = applyCardPayResult(
      current,
      const CardPayResult(purchaseId: 'p1', status: 'PENDING', outcome: 'unknown'),
    );
    expect(unconfirmed.poll, isFalse);
    expect(unconfirmed.attempt.phase, CardAttemptPhase.unknown);
    expect(unconfirmed.attempt.acceptsSubmit, isFalse);
    expect(unconfirmed.attempt.message, cardUnknownWithoutIdMessage);
    expect(unconfirmed.reloadWallet, isFalse);
  });

  test('recusa gera nova chave e estorno antes da confirmação não credita', () {
    final first = CardAttempt(idempotencyKey: 'a' * 16);
    final rejected = applyCardPayResult(
      first,
      const CardPayResult(purchaseId: 'p1', status: 'FAILED', outcome: 'rejected'),
    );
    expect(rejected.rejectBrick, isTrue);
    expect(rejected.reloadWallet, isFalse);
    final second = beginCardSubmit(rejected.attempt, nextKey: () => 'b' * 16);
    expect(second.idempotencyKey, 'b' * 16);

    final earlyRefund = applyCardPayResult(
      first,
      const CardPayResult(purchaseId: 'p1', status: 'REFUNDED', outcome: 'refunded'),
    );
    expect(earlyRefund.reloadWallet, isFalse);
    expect(earlyRefund.attempt.phase, CardAttemptPhase.refunded);
    expect(earlyRefund.attempt.acceptsSubmit, isFalse);
  });

  test('HTTP 402 com outcome rejected encerra sem polling nem crédito', () {
    final parsed = CardPayResult.parse({
      'purchaseId': 'cp-402',
      'status': 'FAILED',
      'outcome': 'rejected',
      'orderId': 'ORD402CARD',
    });
    final step = applyCardPayResult(
      CardAttempt(idempotencyKey: 'a' * 16, phase: CardAttemptPhase.submitting),
      parsed,
    );
    expect(parsed.outcome, 'rejected');
    expect(parsed.orderId, 'ORD402CARD');
    expect(step.attempt.phase, CardAttemptPhase.rejected);
    expect(step.attempt.message, cardRejectedMessage);
    expect(step.attempt.purchaseId, 'cp-402');
    expect(step.poll, isFalse);
    expect(step.reloadWallet, isFalse);
    expect(step.rejectBrick, isTrue);
    expect(step.attempt.acceptsSubmit, isTrue);
  });

  test('lista também reconcilia cartão pendente e ignora as lojas', () async {
    final fetched = <String>[];
    final result = await reconcilePendingPixPurchases(
      purchases: [
        {'id': 'card-pending', 'provider': 'card', 'status': 'PENDING'},
        {'id': 'pix-paid', 'provider': 'pix', 'status': 'PAID'},
        {'id': 'gp-pending', 'provider': 'google_play', 'status': 'PENDING'},
        {'id': 'apple-pending', 'provider': 'app_store', 'status': 'PENDING'},
      ],
      fetchById: (id) async {
        fetched.add(id);
        return {'id': id, 'provider': 'card', 'status': 'PAID'};
      },
    );
    expect(fetched, ['card-pending']);
    expect(result.anyBecamePaid, isTrue);
    expect((result.purchases[1] as Map)['status'], 'PAID');
    expect((result.purchases[2] as Map)['status'], 'PENDING');
  });

  testWidgets('web mostra PIX e cartão com o preço do catálogo', (tester) async {
    await _pumpCheckout(tester, _client(), size: const Size(1280, 900));
    expect(find.text('PIX'), findsOneWidget);
    expect(find.text('Cartão de crédito'), findsOneWidget);
    expect(find.text('1 crédito'), findsOneWidget);
    expect(find.text('R\$ 34,90'), findsOneWidget);
    expect(find.text('R\$ 25,00'), findsNothing);
    expect(find.text('Pagar com PIX'), findsOneWidget);
    expect(find.text('Número do cartão'), findsNothing);
    expect(find.text('CVV'), findsNothing);
    await _disposeCheckout(tester);
  });

  testWidgets('layout permanece utilizável no celular', (tester) async {
    await _pumpCheckout(tester, _client(), size: const Size(360, 780));
    expect(tester.takeException(), isNull);
    expect(find.text('PIX'), findsOneWidget);
    expect(find.text('Cartão de crédito'), findsOneWidget);
    expect(find.text('R\$ 34,90'), findsOneWidget);
    await _disposeCheckout(tester);
  });

  testWidgets('troca para PIX desmonta o Brick e abre o checkout PIX', (tester) async {
    final host = ScriptedCardBrickHost();
    final paths = <String>[];
    await _pumpCheckout(
      tester,
      _client(onPath: (method, path, _) => paths.add('$method $path')),
      host: host,
    );
    await _openCard(tester);
    expect(host.mounts, 1);
    expect(find.text('Número do cartão'), findsNothing);
    expect(find.text('CVV'), findsNothing);

    await tester.tap(find.byKey(const Key('pay-method-pix')));
    await tester.pump();
    expect(host.unmounts, 1);
    expect(find.byKey(const Key('card-brick-slot')), findsNothing);

    await tester.tap(find.byKey(const Key('web-pay-pix')));
    await tester.pump();
    await tester.pump();
    expect(find.byKey(const Key('fiscal-generate-pix')), findsOneWidget);
    expect(paths.where((path) => path.contains('/credits/card/pay')), isEmpty);
    expect(paths.where((path) => path.contains('/credits/pix/create')), isEmpty);
    await _disposeCheckout(tester);
  });

  testWidgets('pagamento aprovado atualiza o saldo só com a resposta da API', (tester) async {
    final host = ScriptedCardBrickHost();
    final bodies = <Map<String, dynamic>>[];
    await _pumpCheckout(
      tester,
      _client(
        pay: {
          'purchaseId': 'cp-approved',
          'status': 'PAID',
          'outcome': 'approved',
          'provider': 'card',
          'credits': 1,
        },
        walletBalance: 8,
        onPay: bodies.add,
      ),
      host: host,
    );
    await _openCard(tester);
    expect(host.amount, 34.9);
    await host.submit(_form(_tokenA));
    await tester.pump();
    await tester.pump();
    expect(find.text('Pagamento confirmado'), findsOneWidget);
    expect(find.text('Saldo atual: 8'), findsOneWidget);
    expect(find.text('Saldo atual: 9'), findsNothing);
    expect(bodies, hasLength(1));
    expect(bodies.single['installments'], 1);
    expect(bodies.single['paymentType'], 'credit_card');
    expect(bodies.single.containsKey('amount'), isFalse);
    expect(bodies.single.containsKey('priceBrl'), isFalse);
    await _disposeCheckout(tester);
  });

  testWidgets('pagamento recusado não reutiliza o token', (tester) async {
    final host = ScriptedCardBrickHost();
    final bodies = <Map<String, dynamic>>[];
    var keys = 0;
    await _pumpCheckout(
      tester,
      _client(
        pay: {
          'purchaseId': 'cp-rejected',
          'status': 'FAILED',
          'outcome': 'rejected',
        },
        onPay: bodies.add,
      ),
      host: host,
      nextKey: () => 'card-key-${(++keys).toString().padLeft(4, '0')}abcd',
    );
    await _openCard(tester);
    await expectLater(
      host.submit(_form(_tokenA)),
      throwsA(isA<CardBrickUserException>()),
    );
    await expectLater(
      host.submit(_form(_tokenB)),
      throwsA(isA<CardBrickUserException>()),
    );
    await tester.pump();
    expect(bodies, hasLength(2));
    expect(bodies[0]['token'], _tokenA);
    expect(bodies[1]['token'], _tokenB);
    expect(bodies[0]['idempotencyKey'], isNot(bodies[1]['idempotencyKey']));
    expect(bodies[1]['token'], isNot(_tokenA));
    expect(find.textContaining(_tokenA), findsNothing);
    expect(find.text(cardRejectedMessage), findsOneWidget);
    await _disposeCheckout(tester);
  });

  testWidgets('recusa do HTTP 402 permanece visível e não consulta nem cobra de novo', (tester) async {
    final host = ScriptedCardBrickHost();
    var pays = 0;
    var reads = 0;
    var walletReads = 0;
    final client = _client(
      pay: {
        'purchaseId': 'cp-402',
        'status': 'FAILED',
        'outcome': 'rejected',
        'orderId': 'ORD402CARD',
      },
      onPay: (_) => pays += 1,
      onPurchaseRead: () => reads += 1,
      onPath: (method, path, _) {
        if (method == 'GET' && path.endsWith('/credits/wallet')) walletReads += 1;
      },
    );
    await _pumpCheckout(
      tester,
      client,
      host: host,
      size: const Size(390, 700),
      pollerFactory: (fetch) => PixPurchasePoller(
        fetchStatus: fetch,
        interval: const Duration(milliseconds: 50),
        timeout: const Duration(seconds: 1),
      ),
    );
    await _openCard(tester);
    expect(host.mounts, 1);
    await expectLater(
      host.submit(_form(_tokenA)),
      throwsA(
        isA<CardBrickUserException>().having(
          (error) => error.message,
          'message',
          cardRejectedMessage,
        ),
      ),
    );
    await tester.pump();
    final list = find.byType(ListView);
    await tester.drag(list, const Offset(0, -500));
    await tester.pump();
    expect(find.text(cardRejectedMessage), findsOneWidget);
    expect(find.text('Processando pagamento'), findsNothing);
    expect(find.text('Aguardando confirmação'), findsNothing);
    _expectNoticeOnScreen(tester, cardRejectedMessage);
    _expectRejectedNotice(tester);
    expect(pays, 1);
    expect(reads, 0);
    expect(walletReads, 0);
    expect(host.unmounts, 0);
    expect(host.mounts, 1);

    await _pumpCheckout(
      tester,
      client,
      host: host,
      size: const Size(390, 700),
      pollerFactory: (fetch) => PixPurchasePoller(
        fetchStatus: fetch,
        interval: const Duration(milliseconds: 50),
      ),
    );
    expect(find.text(cardRejectedMessage), findsOneWidget);
    _expectNoticeOnScreen(tester, cardRejectedMessage);
    expect(pays, 1);
    expect(reads, 0);
    expect(host.unmounts, 0);
    await tester.pump(const Duration(milliseconds: 200));
    expect(pays, 1);
    expect(reads, 0);
    await _disposeCheckout(tester);
  });

  testWidgets('erro do Brick mostra validação sem cobrar nem remontar', (tester) async {
    final host = ScriptedCardBrickHost();
    var pays = 0;
    await _pumpCheckout(
      tester,
      _client(onPay: (_) => pays += 1),
      host: host,
      size: const Size(390, 700),
    );
    await _openCard(tester);
    host.reportError('Não foi possível validar o cartão no formulário seguro.');
    await tester.pump();
    expect(
      find.text('Não foi possível validar o cartão no formulário seguro.'),
      findsOneWidget,
    );
    _expectNoticeOnScreen(tester, 'Não foi possível validar o cartão no formulário seguro.');
    final validationNotice = tester.widget<Container>(
      find.descendant(
        of: find.byKey(const Key('card-payment-notice')),
        matching: find.byType(Container),
      ),
    );
    expect((validationNotice.decoration as BoxDecoration).color, Colors.white);
    expect(find.byIcon(Icons.error_outline_rounded), findsNothing);
    expect(pays, 0);
    expect(host.mounts, 1);
    expect(host.unmounts, 0);
    await _disposeCheckout(tester);
  });

  testWidgets('pagamento pendente consulta a compra e o timeout não cobra de novo', (tester) async {
    final host = ScriptedCardBrickHost();
    var pays = 0;
    var reads = 0;
    await _pumpCheckout(
      tester,
      _client(
        pay: {
          'purchaseId': 'cp-pending',
          'status': 'PENDING',
          'outcome': 'pending',
          'orderId': 'ORD01CARD',
        },
        purchaseStatus: 'PENDING',
        onPay: (_) => pays += 1,
        onPurchaseRead: () => reads += 1,
      ),
      host: host,
      pollerFactory: (fetch) => PixPurchasePoller(
        fetchStatus: fetch,
        interval: const Duration(seconds: 1),
        timeout: const Duration(seconds: 1),
      ),
    );
    await _openCard(tester);
    await host.submit(_form(_tokenA));
    await tester.pump();
    expect(find.text(cardPendingMessage), findsOneWidget);
    expect(pays, 1);
    expect(reads, greaterThan(0));
    await tester.pump(const Duration(seconds: 2));
    await tester.pump();
    expect(find.text(cardPollTimeoutMessage), findsOneWidget);
    expect(pays, 1);
    await _disposeCheckout(tester);
  });

  testWidgets('resultado desconhecido sem order não consulta nem cobra de novo', (tester) async {
    final host = ScriptedCardBrickHost();
    var pays = 0;
    var reads = 0;
    await _pumpCheckout(
      tester,
      _client(
        pay: {
          'purchaseId': 'cp-unknown',
          'status': 'PENDING',
          'outcome': 'unknown',
        },
        onPay: (_) => pays += 1,
        onPurchaseRead: () => reads += 1,
      ),
      host: host,
    );
    await _openCard(tester);
    await host.submit(_form(_tokenA));
    await tester.pump();
    expect(find.text(cardUnknownWithoutIdMessage), findsOneWidget);
    expect(find.text('Aguardando confirmação'), findsNothing);
    expect(pays, 1);
    expect(reads, 0);
    expect(host.unmounts, greaterThan(0));
    await _disposeCheckout(tester);
  });

  testWidgets('falha de comunicação não dispara outra cobrança', (tester) async {
    final host = ScriptedCardBrickHost();
    var pays = 0;
    await _pumpCheckout(
      tester,
      _client(payStatus: 503, onPay: (_) => pays += 1),
      host: host,
    );
    await _openCard(tester);
    final first = host.submit(_form(_tokenA));
    await expectLater(first, throwsA(isA<CardBrickUserException>()));
    final second = host.submit(_form(_tokenB));
    await expectLater(second, throwsA(isA<CardBrickUserException>()));
    expect(pays, 1);
    expect(find.textContaining(_tokenA), findsNothing);
    await tester.pump();
    expect(find.text('Pagamento não confirmado'), findsOneWidget);
    await _disposeCheckout(tester);
  });

  testWidgets('envio simultâneo do Brick só cria uma cobrança', (tester) async {
    final host = ScriptedCardBrickHost();
    final gate = Completer<void>();
    var pays = 0;
    await _pumpCheckout(
      tester,
      _client(
        pay: {
          'purchaseId': 'cp-once',
          'status': 'PENDING',
          'outcome': 'pending',
        },
        onPay: (_) => pays += 1,
        payGate: gate.future,
      ),
      host: host,
    );
    await _openCard(tester);
    final first = host.submit(_form(_tokenA));
    final second = host.submit(_form(_tokenB));
    final secondDone = expectLater(
      second,
      throwsA(isA<CardBrickUserException>()),
    );
    await tester.pump();
    expect(pays, 1);
    await secondDone;
    gate.complete();
    await first;
    await _disposeCheckout(tester);
  });

  testWidgets('sair da tela desmonta o Brick sem cobrar', (tester) async {
    final host = ScriptedCardBrickHost();
    final paths = <String>[];
    await _pumpCheckout(
      tester,
      _client(onPath: (method, path, _) => paths.add('$method $path')),
      host: host,
    );
    await _openCard(tester);
    expect(host.mounts, 1);
    await _disposeCheckout(tester);
    expect(host.unmounts, 1);
    expect(paths.where((path) => path.contains('/credits/card/pay')), isEmpty);
  });

  testWidgets('Android e iOS nativos não mostram cartão Mercado Pago', (tester) async {
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
      debugDefaultTargetPlatformOverride = platform;
      tester.view.physicalSize = const Size(400, 1400);
      tester.view.devicePixelRatio = 1;
      await tester.pumpWidget(
        Provider.value(
          value: ApiClient(client: _client()),
          child: MaterialApp(
            home: CheckoutScreen(pack: Map<String, dynamic>.from(_pack)),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text('Cartão de crédito'), findsNothing);
      expect(find.text('Pagar com PIX'), findsNothing);
      expect(
        find.text(platform == TargetPlatform.iOS ? 'Apple' : 'Google Play'),
        findsWidgets,
      );
      expect(billingUsesStore(isWeb: false, platform: platform), isTrue);
      expect(billingUsesPix(isWeb: false, platform: platform), isFalse);
      await tester.pumpWidget(const SizedBox.shrink());
    }
    debugDefaultTargetPlatformOverride = null;
  });
}

CardBrickForm _form(String token) {
  return CardBrickForm(token: token, paymentMethodId: 'visa');
}

void _expectRejectedNotice(WidgetTester tester) {
  final notice = tester.widget<Container>(
    find.descendant(
      of: find.byKey(const Key('card-payment-notice')),
      matching: find.byType(Container),
    ),
  );
  final decoration = notice.decoration as BoxDecoration;
  expect(decoration.color, const Color(0xFFFDE8E8));
  expect(decoration.borderRadius, BorderRadius.circular(16));
  expect((decoration.border as Border).top.color, const Color(0xFFF5A3A3));
  expect(
    find.descendant(
      of: find.byKey(const Key('card-payment-notice')),
      matching: find.byIcon(Icons.error_outline_rounded),
    ),
    findsOneWidget,
  );
  final icon = tester.widget<Icon>(find.byIcon(Icons.error_outline_rounded));
  expect(icon.color, const Color(0xFFB42318));
  final text = tester.widget<Text>(find.text(cardRejectedMessage));
  expect(text.style?.color, const Color(0xFFB42318));
}

void _expectNoticeOnScreen(WidgetTester tester, String message) {
  final rect = tester.getRect(find.text(message));
  final height = tester.view.physicalSize.height / tester.view.devicePixelRatio;
  expect(rect.top, greaterThanOrEqualTo(0));
  expect(rect.bottom, lessThanOrEqualTo(height + 0.5));
}

Future<void> _openCard(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('pay-method-card')));
  await tester.pump();
  await tester.pump();
  expect(find.byKey(const Key('card-brick-slot')), findsOneWidget);
}

Future<void> _disposeCheckout(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump();
}

Future<void> _pumpCheckout(
  WidgetTester tester,
  http.Client client, {
  ScriptedCardBrickHost? host,
  Size size = const Size(800, 1400),
  PixPurchasePoller Function(PixStatusFetcher fetchStatus)? pollerFactory,
  String Function()? nextKey,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    Provider.value(
      value: ApiClient(client: client),
      child: MaterialApp(
        home: WebCheckoutScreen(
          pack: Map<String, dynamic>.from(_pack),
          brickHost: host,
          usePlatformView: false,
          pollerFactory: pollerFactory,
          nextIdempotencyKey: nextKey,
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

http.Client _client({
  Map<String, dynamic>? pay,
  int payStatus = 200,
  int walletBalance = 0,
  String purchaseStatus = 'PENDING',
  void Function(Map<String, dynamic> body)? onPay,
  void Function()? onPurchaseRead,
  void Function(String method, String path, String body)? onPath,
  Future<void>? payGate,
}) {
  return MockClient((request) async {
    final path = request.url.path;
    onPath?.call(request.method, path, request.body);
    if (payGate != null && path.endsWith('/credits/card/pay')) {
      final body = request.body.isEmpty
          ? <String, dynamic>{}
          : Map<String, dynamic>.from(jsonDecode(request.body) as Map);
      onPay?.call(body);
      await payGate;
      return http.Response(
        jsonEncode(pay ?? {'message': 'indisponível'}),
        payStatus,
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
    if (path.endsWith('/credits/card/config')) {
      return http.Response(
        jsonEncode({'publicKey': 'TEST-public-key', 'maxInstallments': 1}),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.endsWith('/credits/wallet')) {
      return http.Response(
        jsonEncode({'balance': walletBalance}),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.endsWith('/credits/card/pay')) {
      final body = request.body.isEmpty
          ? <String, dynamic>{}
          : Map<String, dynamic>.from(jsonDecode(request.body) as Map);
      onPay?.call(body);
      return http.Response(
        jsonEncode(pay ?? {'message': 'indisponível'}),
        payStatus,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.contains('/credits/purchases/')) {
      onPurchaseRead?.call();
      final id = path.split('/').last;
      return http.Response(
        jsonEncode({'id': id, 'status': purchaseStatus, 'provider': 'card'}),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    return http.Response('{}', 404);
  });
}

class ScriptedCardBrickHost implements CardBrickHost {
  int mounts = 0;
  int unmounts = 0;
  double? amount;
  String? publicKey;
  Future<void> Function(CardBrickForm form)? onSubmit;
  void Function(String message)? onBrickError;

  @override
  bool get usesPlatformView => false;

  @override
  void registerView(String viewType) {}

  @override
  Future<void> mount(CardBrickMountRequest request) async {
    mounts += 1;
    amount = request.amount;
    publicKey = request.publicKey;
    onSubmit = request.onSubmit;
    onBrickError = request.onBrickError;
  }

  @override
  Future<void> unmount() async {
    unmounts += 1;
    onSubmit = null;
    onBrickError = null;
  }

  void reportError(String message) {
    final callback = onBrickError;
    if (callback == null) {
      throw StateError('Brick desmontado');
    }
    callback(message);
  }

  Future<void> submit(CardBrickForm form) {
    final callback = onSubmit;
    if (callback == null) {
      throw StateError('Brick desmontado');
    }
    return callback(form);
  }
}
