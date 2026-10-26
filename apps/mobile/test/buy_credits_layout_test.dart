import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/credits/buy_credits_layout.dart';
import 'package:after_app/features/credits/buy_credits_screen.dart';
import 'package:after_app/features/credits/checkout_screen.dart';
import 'package:after_app/features/credits/credits_ui.dart';
import 'package:after_app/features/credits/web_checkout_screen.dart';

const _commonPackages = [
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

const _vipPackage = {
  'key': 'vip_unit_1',
  'modality': 'VIP',
  'credits': 1,
  'referencePriceBrl': 99.9,
  'currency': 'BRL',
  'storeProductId': 'after.credits.vip.1',
  'storePriceBrl': null,
};

void main() {
  test('economia comum ignora o preço de referência VIP', () {
    final mixed = [
      _vipPackage,
      ..._commonPackages,
    ];
    expect(isVipCreditRecord(_vipPackage), isTrue);
    expect(isVipCreditRecord(_commonPackages.first), isFalse);
    expect(
      isVipCreditRecord({
        'packageKey': 'vip_unit_1',
        'productId': 'after.credits.vip.1',
      }),
      isTrue,
    );
    expect(
      packageSavings(_commonPackages[1], mixed),
      closeTo(24.6, 0.001),
    );
    expect(
      packageSavings(_commonPackages[2], mixed),
      closeTo(149.1, 0.001),
    );
  });

  testWidgets('mostra saldo comum e VIP vindos da carteira', (tester) async {
    await _pumpBuy(
      tester,
      wallet: {'venueId': 'v1', 'balance': 4, 'vipBalance': 1},
    );

    expect(tester.widget<Text>(find.byKey(const Key('balance-common'))).data, '4');
    expect(tester.widget<Text>(find.byKey(const Key('balance-vip'))).data, '1');
    expect(find.text('Créditos comuns'), findsOneWidget);
    expect(find.text('Créditos VIP'), findsOneWidget);
    expect(find.text('créditos disponíveis'), findsNWidgets(2));
  });

  test('seleção inicial prefere VIP na Web quando checkout PIX está pronto', () {
    final vip = Map<String, dynamic>.from(_vipPackage);
    expect(
      preferredInitialBuyCreditsKey(
        vipOffer: vip,
        commonPackages: _commonPackages.map(Map<String, dynamic>.from).toList(),
        vipCheckoutReady: true,
        usePixCheckout: true,
      ),
      'vip_unit_1',
    );
    expect(
      vipPackageCheckoutAvailable(
        vipOffer: vip,
        vipCheckoutReady: true,
        usePixCheckout: true,
      ),
      isTrue,
    );
  });

  test('seleção inicial no app nativo usa comum se VIP não tem checkout', () {
    final vip = Map<String, dynamic>.from(_vipPackage);
    expect(
      preferredInitialBuyCreditsKey(
        vipOffer: vip,
        commonPackages: _commonPackages.map(Map<String, dynamic>.from).toList(),
        vipCheckoutReady: true,
        usePixCheckout: false,
      ),
      'unit_1',
    );
    expect(
      vipPackageCheckoutAvailable(
        vipOffer: vip,
        vipCheckoutReady: true,
        usePixCheckout: false,
      ),
      isFalse,
    );
    expect(
      preferredInitialBuyCreditsKey(
        vipOffer: null,
        commonPackages: _commonPackages.map(Map<String, dynamic>.from).toList(),
        vipCheckoutReady: false,
        usePixCheckout: true,
      ),
      'unit_1',
    );
  });

  test('sem VIP nem pacote comum de 1 credito nao seleciona outro', () {
    expect(
      preferredInitialBuyCreditsKey(
        vipOffer: null,
        commonPackages: [
          Map<String, dynamic>.from(_commonPackages[1]),
          Map<String, dynamic>.from(_commonPackages[2]),
        ],
        vipCheckoutReady: false,
        usePixCheckout: true,
      ),
      isNull,
    );
  });

  test('ordenacao fixa dos pacotes comuns 1, 5 e 10 creditos', () {
    final shuffled = [
      _commonPackages[2],
      _commonPackages[0],
      _commonPackages[1],
    ].map((e) => Map<String, dynamic>.from(e)).toList();
    final sorted = sortCommonCreditPackages(shuffled);
    expect(
      sorted.map((p) => p['key']?.toString()).toList(),
      ['unit_1', 'combo_5', 'combo_10'],
    );
  });

  testWidgets('Android/iOS inicia no pacote comum mesmo com VIP no catálogo',
      (tester) async {
    await _pumpBuy(
      tester,
      size: const Size(390, 1600),
      usePixCheckout: false,
    );

    expect(find.text('Total: R\$ 34,90'), findsOneWidget);
    expect(_border(tester, 'unit_1'), buyCreditsOrange);
  });

  testWidgets('mantém pacote comum após escolha manual no refresh',
      (tester) async {
    await _pumpBuy(tester, size: const Size(800, 1600));
    expect(find.text('Total: R\$ 99,90'), findsOneWidget);

    await tester.tap(find.text('5 créditos'));
    await tester.pump();
    expect(find.text('Total: R\$ 149,90'), findsOneWidget);

    await tester.drag(find.byType(ListView), const Offset(0, 200));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();

    expect(find.text('Total: R\$ 149,90'), findsOneWidget);
    expect(_border(tester, 'combo_5'), buyCreditsOrange);
  });

  test('catálogo local oficial permanece só de referência', () {
    expect(officialVipReferenceOffer['key'], 'vip_unit_1');
    expect(officialVipReferenceOffer['storeProductId'], 'after.credits.vip.1');
    expect(officialVipReferenceOffer['credits'], 1);
    expect(officialVipReferenceOffer['referencePriceBrl'], 99.9);
    expect(officialVipReferenceOffer['storePriceBrl'], isNull);
    expect(firstDisplayableVipOffer([_vipPackage])?['key'], 'vip_unit_1');
    expect(firstDisplayableVipOffer({'key': 'vip_unit_1'}), isNull);
    expect(
      firstDisplayableVipOffer([
        {'key': 'vip_unit_1', 'modality': 'VIP', 'credits': 1},
      ]),
      isNull,
    );
  });

  testWidgets('catálogo VIP remoto aparece acima dos pacotes comuns',
      (tester) async {
    await _pumpBuy(tester, size: const Size(800, 1600));

    expect(find.byKey(const Key('vip-catalog-error')), findsNothing);
    expect(find.text('1 crédito VIP'), findsOneWidget);
    expect(find.text('R\$ 99,90'), findsOneWidget);
    _expectCommonPackages(tester);
    expect(_tileTop(tester, 'vip_unit_1'), lessThan(_tileTop(tester, 'unit_1')));
    expect(_tileTop(tester, 'unit_1'), lessThan(_tileTop(tester, 'combo_5')));
    expect(_tileTop(tester, 'combo_5'), lessThan(_tileTop(tester, 'combo_10')));
    expect(_border(tester, 'vip_unit_1'), buyCreditsPurple);
  });

  testWidgets('API antiga sem o endpoint mostra o VIP informativo',
      (tester) async {
    final posts = <String>[];
    await _pumpBuy(
      tester,
      size: const Size(800, 1600),
      vipStatus: 404,
      onRequest: (request) {
        if (request.method == 'POST') posts.add(request.url.path);
      },
    );

    expect(find.byKey(const Key('vip-catalog-error')), findsNothing);
    expect(find.text('1 crédito VIP'), findsOneWidget);
    expect(
      find.text('Destaque na página HOME e\nenvio de aviso aos usuários'),
      findsOneWidget,
    );
    expect(find.text('R\$ 99,90'), findsOneWidget);
    _expectCommonPackages(tester);
    expect(find.text('Total: R\$ 34,90'), findsOneWidget);
    expect(_border(tester, 'unit_1'), buyCreditsOrange);
    expect(_tileTop(tester, 'vip_unit_1'), lessThan(_tileTop(tester, 'unit_1')));

    await tester.tap(find.text('1 crédito VIP'));
    await tester.pump();
    expect(find.text('Total: R\$ 99,90'), findsOneWidget);

    await tester.tap(find.text('Continuar para pagamento'));
    await tester.pumpAndSettle();
    expect(find.textContaining('ainda não está disponível'), findsOneWidget);
    expect(find.byType(WebCheckoutScreen), findsNothing);
    expect(find.byType(CheckoutScreen), findsNothing);
    expect(posts, isEmpty);
  });

  testWidgets('erro de rede no catálogo VIP não finge sucesso', (tester) async {
    await _pumpBuy(
      tester,
      size: const Size(800, 1600),
      vipThrow: true,
    );

    expect(find.text(vipCatalogUnavailableMessage), findsOneWidget);
    expect(find.text('1 crédito VIP'), findsNothing);
    expect(find.text('R\$ 99,90'), findsNothing);
    _expectCommonPackages(tester);
    expect(find.text('Total: R\$ 34,90'), findsOneWidget);

    await tester.tap(find.text('Continuar para pagamento'));
    await tester.pump();
    await tester.pump();
    expect(find.byType(WebCheckoutScreen), findsOneWidget);
    final screen = tester.widget<WebCheckoutScreen>(find.byType(WebCheckoutScreen));
    expect(screen.pack['key'], 'unit_1');
    expect(screen.pack['priceBrl'], 34.9);
  });

  testWidgets('resposta VIP inválida não vira o catálogo local', (tester) async {
    await _pumpBuy(
      tester,
      size: const Size(800, 1600),
      vipBody: {
        'key': 'vip_unit_1',
        'modality': 'VIP',
        'credits': 1,
        'referencePriceBrl': 99.9,
      },
    );

    expect(find.text(vipCatalogUnavailableMessage), findsOneWidget);
    expect(find.text('1 crédito VIP'), findsNothing);
    expect(find.text('R\$ 99,90'), findsNothing);
    _expectCommonPackages(tester);
    expect(find.text('Total: R\$ 34,90'), findsOneWidget);
  });

  testWidgets('erro HTTP do catálogo VIP não usa o preço local', (tester) async {
    await _pumpBuy(tester, size: const Size(800, 1600), vipStatus: 500);

    expect(find.text(vipCatalogUnavailableMessage), findsOneWidget);
    expect(find.text('1 crédito VIP'), findsNothing);
    expect(find.text('R\$ 99,90'), findsNothing);
    _expectCommonPackages(tester);
  });

  testWidgets('web larga mantém o VIP no topo da coluna', (tester) async {
    await _pumpBuy(tester, size: const Size(1200, 900));

    expect(tester.takeException(), isNull);
    expect(find.text('1 crédito VIP'), findsOneWidget);
    _expectCommonPackages(tester);
    final vip = tester.getRect(find.byKey(const ValueKey('pack-vip_unit_1')));
    final common = tester.getRect(find.byKey(const ValueKey('pack-unit_1')));
    expect(vip.top, lessThan(common.top));
    expect(vip.center.dx, closeTo(600, 40));
    expect(vip.width, lessThanOrEqualTo(430));
  });

  testWidgets('seleção única atualiza o total e mantém a economia comum',
      (tester) async {
    await _pumpBuy(tester, size: const Size(800, 1600));

    expect(find.text('1 crédito VIP'), findsOneWidget);
    expect(find.text('Destaque na página HOME e\nenvio de aviso aos usuários'), findsOneWidget);
    expect(find.text('R\$ 99,90'), findsOneWidget);
    expect(find.text('Ideal para testar'), findsOneWidget);
    expect(find.text('Mais popular'), findsOneWidget);
    expect(find.text('Melhor custo-benefício'), findsOneWidget);
    expect(find.text('R\$ 34,90 por crédito'), findsOneWidget);
    expect(find.text('R\$ 29,98 por crédito'), findsOneWidget);
    expect(find.text('R\$ 19,99 por crédito'), findsOneWidget);
    expect(find.text('Economize R\$ 24,60'), findsOneWidget);
    expect(find.text('Economize R\$ 149,10'), findsOneWidget);
    expect(find.text('Total: R\$ 99,90'), findsOneWidget);
    expect(find.text('Total: R\$ 199,90'), findsNothing);
    expect(_border(tester, 'vip_unit_1'), buyCreditsPurple);
    expect(_border(tester, 'unit_1'), buyCreditsBorder);
    expect(_border(tester, 'combo_10'), buyCreditsBorder);

    await tester.tap(find.text('1 crédito'));
    await tester.pump();
    expect(find.text('Total: R\$ 34,90'), findsOneWidget);
    expect(_border(tester, 'unit_1'), buyCreditsOrange);
    expect(_border(tester, 'combo_5'), buyCreditsBorder);

    await tester.tap(find.text('5 créditos'));
    await tester.pump();
    expect(find.text('Total: R\$ 149,90'), findsOneWidget);
    expect(_border(tester, 'combo_5'), buyCreditsOrange);
    expect(_border(tester, 'unit_1'), buyCreditsBorder);
  });

  testWidgets('histórico vazio não inventa compra VIP', (tester) async {
    await _pumpBuy(tester);

    expect(find.text('Últimas compras'), findsNWidgets(2));
    expect(find.text('Nenhuma compra ainda.'), findsOneWidget);
    expect(find.byKey(const ValueKey('history-vip-1')), findsNothing);
  });

  testWidgets('histórico comum usa valor laranja e status Pago', (tester) async {
    const createdAt = '2026-10-09T14:14:00.000Z';
    await _pumpBuy(
      tester,
      size: const Size(800, 1800),
      purchases: [
        {
          'id': 'common-1',
          'provider': 'app_store',
          'status': 'PAID',
          'credits': 1,
          'amountPaid': 34.9,
          'packageKey': 'unit_1',
          'productId': 'after.credits.1',
          'createdAt': createdAt,
        },
      ],
    );

    expect(find.text('1 crédito VIP'), findsOneWidget);
    expect(find.byKey(const ValueKey('history-common-1')), findsOneWidget);
    expect(find.text('App Store'), findsOneWidget);
    expect(find.text(formatPurchaseDate(createdAt)), findsOneWidget);
    final amount = tester.widget<Text>(
      find.descendant(
        of: find.byKey(const ValueKey('history-common-1')),
        matching: find.text('R\$ 34,90'),
      ),
    );
    expect(amount.style?.color, buyCreditsOrange);
    final paid = tester.widget<Text>(
      find.descendant(
        of: find.byKey(const ValueKey('history-common-1')),
        matching: find.text('Pago'),
      ),
    );
    expect(paid.style?.color, buyCreditsPaidFg);
  });

  testWidgets('histórico VIP usa o payload real e pinta o valor de roxo',
      (tester) async {
    await _pumpBuy(
      tester,
      size: const Size(800, 1800),
      purchases: [
        {
          'id': 'common-1',
          'provider': 'pix',
          'status': 'PAID',
          'credits': 5,
          'amountPaid': 149.9,
          'packageKey': 'combo_5',
          'createdAt': '2026-10-09T14:14:00.000Z',
        },
        {
          'id': 'vip-1',
          'provider': 'card',
          'status': 'PAID',
          'credits': 1,
          'amountPaid': 99.9,
          'packageKey': 'vip_unit_1',
          'productId': 'after.credits.vip.1',
          'createdAt': '2026-10-01T21:27:00.000Z',
        },
      ],
    );

    expect(find.text('5 créditos'), findsNWidgets(2));
    expect(find.text('PIX'), findsOneWidget);
    expect(find.text('Cartão de crédito'), findsOneWidget);
    final amount = tester.widget<Text>(
      find.descendant(
        of: find.byKey(const ValueKey('history-vip-1')),
        matching: find.text('R\$ 99,90'),
      ),
    );
    expect(amount.style?.color, buyCreditsPurple);
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('history-vip-1')),
        matching: find.text('1 crédito VIP'),
      ),
      findsOneWidget,
    );
  });

  testWidgets('preserva os status reais da compra', (tester) async {
    await _pumpBuy(
      tester,
      size: const Size(800, 2200),
      purchases: [
        _purchase('p', 'PENDING'),
        _purchase('ok', 'PAID'),
        _purchase('f', 'FAILED'),
        _purchase('c', 'CANCELLED'),
        _purchase('r', 'REFUNDED'),
      ],
    );

    expect(find.text('Aguardando pagamento', skipOffstage: false), findsOneWidget);
    expect(find.text('Pago', skipOffstage: false), findsOneWidget);
    expect(find.text('Falhou', skipOffstage: false), findsOneWidget);
    expect(find.text('Cancelado', skipOffstage: false), findsOneWidget);
    expect(find.text('Reembolsado', skipOffstage: false), findsOneWidget);
  });

  testWidgets('falha ao carregar a carteira não mostra saldo ilustrativo',
      (tester) async {
    await _pumpBuy(tester, walletStatus: 500);

    expect(find.text('Não foi possível carregar o saldo.'), findsOneWidget);
    expect(find.byKey(const Key('balance-common')), findsNothing);
    expect(find.byKey(const Key('balance-vip')), findsNothing);
    expect(find.text('4'), findsNothing);
    expect(find.text('1'), findsNothing);
  });

  testWidgets('checkout comum abre o pagamento do pacote selecionado',
      (tester) async {
    await _pumpBuy(
      tester,
      size: const Size(800, 1600),
      usePixCheckout: true,
    );

    await tester.tap(find.text('1 crédito'));
    await tester.pump();
    await tester.tap(find.text('Continuar para pagamento'));
    await tester.pump();
    await tester.pump();

    expect(find.byType(WebCheckoutScreen), findsOneWidget);
    final screen = tester.widget<WebCheckoutScreen>(find.byType(WebCheckoutScreen));
    expect(screen.pack['key'], 'unit_1');
    expect(screen.pack['priceBrl'], 34.9);
    expect(screen.pack.containsKey('referencePriceBrl'), isFalse);
    expect(find.text('Pagar com PIX'), findsWidgets);
  });

  testWidgets('web com catálogo remoto abre PIX e cartão do VIP', (tester) async {
    final posts = <String>[];
    await _pumpBuy(
      tester,
      size: const Size(800, 1600),
      usePixCheckout: true,
      onRequest: (request) {
        if (request.method == 'POST') posts.add(request.url.path);
      },
    );

    expect(find.text('Total: R\$ 99,90'), findsOneWidget);

    await tester.tap(find.text('Continuar para pagamento'));
    await tester.pump();
    await tester.pump();

    expect(find.byType(WebCheckoutScreen), findsOneWidget);
    expect(find.byType(CheckoutScreen), findsNothing);
    final screen = tester.widget<WebCheckoutScreen>(find.byType(WebCheckoutScreen));
    expect(screen.pack['key'], 'vip_unit_1');
    expect(screen.pack['priceBrl'], 99.9);
    expect(screen.pack['storeProductId'], 'after.credits.vip.1');
    expect(find.text('Pagar com PIX'), findsOneWidget);
    expect(find.byKey(const Key('vip-checkout-blocked')), findsNothing);
    expect(posts, isEmpty);
  });

  testWidgets('continuar com VIP não abre checkout nem cobra', (tester) async {
    final posts = <String>[];
    await _pumpBuy(
      tester,
      size: const Size(800, 1600),
      usePixCheckout: false,
      onRequest: (request) {
        if (request.method == 'POST') posts.add(request.url.path);
      },
    );

    expect(find.text('Total: R\$ 34,90'), findsOneWidget);
    expect(_border(tester, 'unit_1'), buyCreditsOrange);

    await tester.tap(find.text('1 crédito VIP'));
    await tester.pump();
    expect(find.text('Total: R\$ 99,90'), findsOneWidget);

    await tester.tap(find.text('Continuar para pagamento'));
    await tester.pumpAndSettle();

    expect(
      find.textContaining('ainda não está disponível'),
      findsOneWidget,
    );
    expect(find.byType(WebCheckoutScreen), findsNothing);
    expect(find.byType(CheckoutScreen), findsNothing);
    expect(posts, isEmpty);

    await tester.tap(find.text('Entendi'));
    await tester.pumpAndSettle();
    expect(find.text('Total: R\$ 99,90'), findsOneWidget);
    expect(find.byType(CheckoutScreen), findsNothing);
  });

  testWidgets('atalho Últimas compras rola até o histórico', (tester) async {
    await _pumpBuy(tester, size: const Size(390, 520));

    await tester.tap(find.byKey(const Key('balance-history-link')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('purchase-history')), findsOneWidget);
    final after = tester.getRect(find.byKey(const Key('purchase-history')));
    expect(after.top, greaterThanOrEqualTo(0));
    expect(after.bottom, lessThanOrEqualTo(520));
  });

  testWidgets('cabe em tela estreita, fonte ampliada e área segura', (tester) async {
    await _pumpBuy(
      tester,
      size: const Size(320, 800),
      textScale: 1.6,
    );
    expect(tester.takeException(), isNull);
    expect(find.text('Comprar créditos'), findsOneWidget);
    expect(find.text('Continuar para pagamento'), findsOneWidget);
    expect(find.text('Pagamento 100% seguro'), findsOneWidget);
    expect(find.text('Escolha um pacote'), findsOneWidget);

    await _pumpBuy(
      tester,
      size: const Size(390, 844),
      bottomInset: 34,
    );
    expect(tester.takeException(), isNull);
    final lock = tester.getRect(find.text('Pagamento 100% seguro'));
    expect(lock.bottom, lessThanOrEqualTo(844 - 34));
    final button = tester.getRect(find.byKey(const Key('buy-credits-continue')));
    expect(button.bottom, lessThan(lock.top));
    expect(button.width, lessThanOrEqualTo(390));

    await _pumpBuy(tester, size: const Size(375, 812), textScale: 1.3);
    expect(tester.takeException(), isNull);
    expect(find.text('Total: R\$ 99,90'), findsOneWidget);
    expect(find.text('Continuar para pagamento'), findsOneWidget);

    await _pumpBuy(tester, size: const Size(1200, 900));
    expect(tester.takeException(), isNull);
    final wideButton = tester.getRect(find.byKey(const Key('buy-credits-continue')));
    expect(wideButton.width, lessThanOrEqualTo(400));
    expect(wideButton.center.dx, closeTo(600, 30));
  });
}

Map<String, dynamic> _purchase(String id, String status) {
  return {
    'id': id,
    'provider': 'pix',
    'status': status,
    'credits': 1,
    'amountPaid': 34.9,
    'packageKey': 'unit_1',
    'createdAt': '2026-10-09T14:14:00.000Z',
  };
}

void _expectCommonPackages(WidgetTester tester) {
  expect(find.text('1 crédito'), findsOneWidget);
  expect(find.text('5 créditos'), findsOneWidget);
  expect(find.text('10 créditos'), findsOneWidget);
  expect(find.text('R\$ 34,90'), findsWidgets);
  expect(find.text('R\$ 149,90'), findsOneWidget);
  expect(find.text('R\$ 199,90'), findsWidgets);
}

double _tileTop(WidgetTester tester, String key) {
  return tester.getRect(find.byKey(ValueKey('pack-$key'))).top;
}

Color _border(WidgetTester tester, String key) {
  final material = tester.widget<Material>(
    find.descendant(
      of: find.byKey(ValueKey('pack-$key')),
      matching: find.byType(Material),
    ).first,
  );
  return (material.shape! as RoundedRectangleBorder).side.color;
}

Future<void> _pumpBuy(
  WidgetTester tester, {
  Map<String, dynamic> wallet = const {
    'venueId': 'v1',
    'balance': 4,
    'vipBalance': 1,
  },
  int walletStatus = 200,
  int vipStatus = 200,
  Object? vipBody,
  bool vipThrow = false,
  List<Map<String, dynamic>> purchases = const [],
  bool usePixCheckout = true,
  Size size = const Size(800, 1400),
  double textScale = 1,
  double bottomInset = 0,
  void Function(http.Request request)? onRequest,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  tester.view.padding = FakeViewPadding(bottom: bottomInset);
  tester.view.viewPadding = FakeViewPadding(bottom: bottomInset);
  addTearDown(tester.view.reset);

  final client = MockClient((request) async {
    onRequest?.call(request);
    final path = request.url.path;
    if (path.endsWith('/credits/wallet')) {
      return http.Response(
        jsonEncode(
          walletStatus == 200
              ? wallet
              : {'message': 'Não foi possível carregar o saldo.'},
        ),
        walletStatus,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.endsWith('/credits/vip-packages')) {
      if (vipThrow) {
        throw http.ClientException('sem rede');
      }
      final payload = vipBody ??
          (vipStatus == 200 ? [_vipPackage] : <String, dynamic>{});
      return http.Response(
        jsonEncode(payload),
        vipStatus,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path.endsWith('/credits/packages')) {
      return http.Response(
        jsonEncode(_commonPackages),
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (path == '/credits/purchases') {
      return http.Response(
        jsonEncode(purchases),
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
        builder: (context, child) {
          final data = MediaQuery.of(context);
          return MediaQuery(
            data: data.copyWith(textScaler: TextScaler.linear(textScale)),
            child: child ?? const SizedBox.shrink(),
          );
        },
        home: BuyCreditsScreen(
          reconcilePendingPix: false,
          usePixCheckout: usePixCheckout,
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}
