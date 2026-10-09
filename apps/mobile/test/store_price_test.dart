import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/credits/checkout_screen.dart';
import 'package:after_app/features/credits/credits_ui.dart';
import 'package:after_app/features/credits/store_billing.dart';
import 'package:after_app/features/credits/store_price.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

IosStorePrice _resolve(String? price, String? code, String? symbol, String? country) =>
    resolveIosStorePrice(
      displayPrice: price,
      currencyCode: code,
      currencySymbol: symbol,
      storefrontCountry: country,
    );

void _expectHidden(IosStorePrice result) {
  expect(result.showsAmount, isFalse);
  expect(result.label, isNull);
  expect(result.message, kIosStorePriceWithheldMessage);
  expect(iosCheckoutAmountText(result), kIosStorePriceWithheldMessage);
  expect(appleCheckoutButtonLabel(result), 'Pagar com Apple');
}

class _FakeStoreBilling implements StoreBilling {
  _FakeStoreBilling({this.product, this.storefront});

  final StoreProductInfo? product;
  final String? storefront;
  final List<String> loaded = [];
  final List<String> purchases = [];

  @override
  Future<void> Function(StorePurchase purchase)? onUnfinishedPurchase;

  @override
  Future<StoreProductInfo?> loadProduct(String productId) async {
    loaded.add(productId);
    return product;
  }

  @override
  Future<String?> currentStorefrontCountry() async => storefront;

  @override
  Future<StorePurchase> purchase(String productId) async {
    purchases.add(productId);
    throw StoreBillingException('Compra cancelada.');
  }

  @override
  Future<void> complete(StorePurchase purchase) async {}

  @override
  void dispose() {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

const _packs = [
  ('unit_1', 'after.credits.1', 1, 34.9, r'R$ 34,90'),
  ('combo_5', 'after.credits.5', 5, 149.9, r'R$ 149,90'),
  ('combo_10', 'after.credits.10', 10, 199.9, r'R$ 199,90'),
];

Future<void> _pumpCheckout(
  WidgetTester tester, {
  required _FakeStoreBilling store,
  String key = 'unit_1',
  int credits = 1,
  double priceBrl = 34.9,
}) async {
  tester.view.physicalSize = const Size(1200, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    Provider<ApiClient>.value(
      value: ApiClient(),
      child: MaterialApp(
        home: CheckoutScreen(
          pack: {'key': key, 'credits': credits, 'priceBrl': priceBrl},
          storeBilling: store,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

CreditsPurpleButton _payButton(WidgetTester tester) =>
    tester.widget<CreditsPurpleButton>(find.byType(CreditsPurpleButton));

void main() {
  group('regra Brasil: BRA + BRL + texto em R\$', () {
    test(r'USD + USA fica oculto, inclusive US$ 4,99 do TestFlight', () {
      for (final symbol in [r'US$', r'$', '']) {
        final result = _resolve(r'US$ 4,99', 'USD', symbol, 'USA');
        expect(result.status, IosStorePriceStatus.divergent);
        _expectHidden(result);
      }
      final english = _resolve(r'$4.99', 'USD', r'$', 'USA');
      expect(english.status, IosStorePriceStatus.divergent);
      _expectHidden(english);
      expect(appleCheckoutButtonLabel(english).contains('4,99'), isFalse);
      expect(appleCheckoutButtonLabel(english).contains('4.99'), isFalse);
    });

    test('USD + BRA fica oculto', () {
      for (final price in [r'US$ 4,99', r'$4.99', 'USD 4.99']) {
        final result = _resolve(price, 'USD', r'$', 'BRA');
        expect(result.status, IosStorePriceStatus.divergent);
        _expectHidden(result);
      }
    });

    test(r'BRL + BRA + texto R$ é exibido nos três pacotes', () {
      for (final pack in _packs) {
        final price = pack.$5;
        final result = _resolve(price, 'BRL', r'R$', 'BRA');
        expect(result.status, IosStorePriceStatus.trusted);
        expect(result.label, price);
        expect(result.showsAmount, isTrue);
        expect(result.message, isNull);
        expect(iosCheckoutAmountText(result), price);
        expect(appleCheckoutButtonLabel(result), 'Pagar com Apple $price');
      }
      expect(_resolve(r'R$34,90', 'BRL', r'R$', 'bra').label, r'R$34,90');
      expect(_resolve(r'R$ 34,90', '', '', 'BRA').label, r'R$ 34,90');
    });

    test('BRL + USA fica oculto', () {
      final result = _resolve(r'R$ 34,90', 'BRL', r'R$', 'USA');
      expect(result.status, IosStorePriceStatus.divergent);
      _expectHidden(result);
    });

    test('storefront diferente de BRA fica oculto', () {
      for (final country in ['BR', 'PRT', 'XXX', 'DEU']) {
        _expectHidden(_resolve(r'R$ 34,90', 'BRL', r'R$', country));
      }
      _expectHidden(_resolve('9,99 €', 'EUR', '€', 'DEU'));
      _expectHidden(_resolve('¥120', 'JPY', '¥', 'JPN'));
    });

    test('storefront ausente fica oculto', () {
      for (final country in [null, '', '   ']) {
        final result = _resolve(r'R$ 34,90', 'BRL', r'R$', country);
        expect(result.status, IosStorePriceStatus.unavailable);
        _expectHidden(result);
      }
    });

    test('moeda contraditória fica oculta', () {
      final cases = [
        (r'R$ 34,90', 'USD', r'R$'),
        (r'R$ 34,90', 'BRL', r'US$'),
        (r'US$ 4,99', 'BRL', r'R$'),
        (r'R$ 34,90 US$', 'BRL', r'R$'),
        (r'R$ 34,90 USD', 'BRL', r'R$'),
        (r'AR$ 34,90', 'BRL', r'R$'),
        ('9,99 €', 'BRL', r'R$'),
      ];
      for (final (price, code, symbol) in cases) {
        final result = _resolve(price, code, symbol, 'BRA');
        expect(result.status, IosStorePriceStatus.divergent, reason: '$price/$code/$symbol');
        _expectHidden(result);
      }
    });

    test('moeda não identificável ou preço indisponível fica oculto', () {
      for (final price in [null, '', '34,90']) {
        final result = _resolve(price, 'BRL', r'R$', 'BRA');
        expect(result.status, IosStorePriceStatus.unavailable);
        _expectHidden(result);
      }
      expect(() => _resolve(null, null, null, null), returnsNormally);
      expect(iosCheckoutAmountText(null), '');
      expect(appleCheckoutButtonLabel(null), 'Pagar com Apple');
    });
  });

  group('checkout iOS', () {
    final ios = TargetPlatformVariant.only(TargetPlatform.iOS);

    testWidgets(r'storefront USA com US$ 4,99 oculta o valor e mantém a compra', (tester) async {
      final store = _FakeStoreBilling(
        product: const StoreProductInfo(
          id: 'after.credits.1',
          price: r'US$ 4,99',
          currencyCode: 'USD',
          currencySymbol: r'US$',
        ),
        storefront: 'USA',
      );
      await _pumpCheckout(tester, store: store);

      expect(find.textContaining('4,99'), findsNothing);
      expect(find.textContaining('34,90'), findsNothing);
      expect(find.text(kIosStorePriceWithheldMessage), findsNWidgets(3));
      expect(_payButton(tester).label, 'Pagar com Apple');
      expect(_payButton(tester).onPressed, isNotNull);

      await tester.ensureVisible(find.byType(CreditsPurpleButton));
      await tester.tap(find.byType(CreditsPurpleButton));
      await tester.pumpAndSettle();
      expect(store.purchases, ['after.credits.1']);
    }, variant: ios);

    testWidgets('preço indisponível mantém a compra habilitada quando o produto existe', (tester) async {
      final store = _FakeStoreBilling(
        product: const StoreProductInfo(id: 'after.credits.5', price: ''),
        storefront: null,
      );
      await _pumpCheckout(tester, store: store, key: 'combo_5', credits: 5, priceBrl: 149.9);

      expect(store.loaded, ['after.credits.5']);
      expect(find.textContaining('149,90'), findsNothing);
      expect(find.text(kIosStorePriceWithheldMessage), findsNWidgets(3));
      expect(_payButton(tester).label, 'Pagar com Apple');
      expect(_payButton(tester).onPressed, isNotNull);

      await tester.ensureVisible(find.byType(CreditsPurpleButton));
      await tester.tap(find.byType(CreditsPurpleButton));
      await tester.pumpAndSettle();
      expect(store.purchases, ['after.credits.5']);
    }, variant: ios);

    testWidgets(r'BRA + BRL + R$ exibe o preço da Apple nos três pacotes', (tester) async {
      for (final (key, productId, credits, priceBrl, price) in _packs) {
        final store = _FakeStoreBilling(
          product: StoreProductInfo(
            id: productId,
            price: price,
            currencyCode: 'BRL',
            currencySymbol: r'R$',
          ),
          storefront: 'BRA',
        );
        await _pumpCheckout(tester, store: store, key: key, credits: credits, priceBrl: priceBrl);

        expect(store.loaded, [productId]);
        expect(find.text(price), findsNWidgets(3));
        expect(find.text(kIosStorePriceWithheldMessage), findsNothing);
        expect(_payButton(tester).label, 'Pagar com Apple $price');
        expect(_payButton(tester).onPressed, isNotNull);
        await tester.pumpWidget(const SizedBox());
      }
    }, variant: ios);

    testWidgets('produto inexistente continua bloqueado como antes', (tester) async {
      final store = _FakeStoreBilling(product: null, storefront: 'BRA');
      await _pumpCheckout(tester, store: store);

      expect(find.textContaining('Produto ainda não publicado'), findsOneWidget);
      expect(_payButton(tester).onPressed, isNull);
    }, variant: ios);
  });
}
