import 'package:after_app/features/credits/store_price.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('preço localizado compatível com o storefront é exibido como veio', () {
    final brazil = resolveIosStorePrice(
      displayPrice: r'R$ 34,90',
      currencyCode: 'BRL',
      currencySymbol: r'R$',
      storefrontCountry: 'BRA',
    );
    expect(brazil.status, IosStorePriceStatus.trusted);
    expect(brazil.label, r'R$ 34,90');
    expect(brazil.showsAmount, isTrue);
    expect(brazil.message, isNull);
    expect(appleCheckoutButtonLabel(brazil), r'Pagar com Apple R$ 34,90');

    final usa = resolveIosStorePrice(
      displayPrice: r'$4.99',
      currencyCode: 'USD',
      currencySymbol: r'$',
      storefrontCountry: 'USA',
    );
    expect(usa.status, IosStorePriceStatus.trusted);
    expect(usa.label, r'$4.99');

    final euro = resolveIosStorePrice(
      displayPrice: '9,99 €',
      currencyCode: 'EUR',
      currencySymbol: '€',
      storefrontCountry: 'DEU',
    );
    expect(euro.status, IosStorePriceStatus.trusted);
    expect(euro.label, '9,99 €');

    final canada = resolveIosStorePrice(
      displayPrice: r'CA$ 6.99',
      currencyCode: 'CAD',
      currencySymbol: r'CA$',
      storefrontCountry: 'CAN',
    );
    expect(canada.status, IosStorePriceStatus.trusted);
    expect(canada.label, r'CA$ 6.99');

    final japan = resolveIosStorePrice(
      displayPrice: '¥120',
      currencyCode: 'JPY',
      currencySymbol: '¥',
      storefrontCountry: 'JPN',
    );
    expect(japan.status, IosStorePriceStatus.trusted);
    expect(japan.label, '¥120');
  });

  test('os três pacotes usam a mesma regra, sem preço fixo', () {
    const storePrices = [r'R$ 34,90', r'R$ 149,90', r'R$ 199,90'];
    for (final price in storePrices) {
      final result = resolveIosStorePrice(
        displayPrice: price,
        currencyCode: 'BRL',
        currencySymbol: r'R$',
        storefrontCountry: 'BRA',
      );
      expect(result.status, IosStorePriceStatus.trusted);
      expect(result.label, price);
    }
  });

  test(r'US$ 4,99 no storefront brasileiro não vira preço final', () {
    final reported = resolveIosStorePrice(
      displayPrice: r'US$ 4,99',
      currencyCode: 'BRL',
      currencySymbol: r'R$',
      storefrontCountry: 'BRA',
    );
    expect(reported.status, IosStorePriceStatus.divergent);
    expect(reported.label, isNull);
    expect(reported.showsAmount, isFalse);
    expect(reported.message, kIosStorePriceWithheldMessage);
    expect(appleCheckoutButtonLabel(reported), 'Pagar com Apple');
    expect(appleCheckoutButtonLabel(reported).contains('4,99'), isFalse);
    expect(appleCheckoutButtonLabel(reported).contains('34,90'), isFalse);
    expect(iosCheckoutAmountText(reported), kIosStorePriceWithheldMessage);

    final englishDevice = resolveIosStorePrice(
      displayPrice: r'$4.99',
      currencyCode: 'USD',
      currencySymbol: r'$',
      storefrontCountry: 'BRA',
    );
    expect(englishDevice.status, IosStorePriceStatus.divergent);
    expect(englishDevice.label, isNull);
    expect(iosCheckoutAmountText(englishDevice), kIosStorePriceWithheldMessage);

    final euroOnBrazil = resolveIosStorePrice(
      displayPrice: '9,99 €',
      currencyCode: 'EUR',
      currencySymbol: '€',
      storefrontCountry: 'BRA',
    );
    expect(euroOnBrazil.status, IosStorePriceStatus.divergent);
    expect(euroOnBrazil.label, isNull);
    expect(iosCheckoutAmountText(euroOnBrazil), kIosStorePriceWithheldMessage);

    final yenOnUsa = resolveIosStorePrice(
      displayPrice: '¥500',
      currencyCode: 'JPY',
      currencySymbol: '¥',
      storefrontCountry: 'USA',
    );
    expect(yenOnUsa.status, IosStorePriceStatus.divergent);
    expect(yenOnUsa.label, isNull);
    expect(iosCheckoutAmountText(yenOnUsa), kIosStorePriceWithheldMessage);
  });

  test(r'$ sozinho não é tratado como dólar', () {
    final result = resolveIosStorePrice(
      displayPrice: r'$4.99',
      currencyCode: '',
      currencySymbol: '',
      storefrontCountry: 'USA',
    );
    expect(result.status, IosStorePriceStatus.unavailable);
    expect(result.label, isNull);
    expect(result.message, kIosStorePriceWithheldMessage);
    expect(iosCheckoutAmountText(result), kIosStorePriceWithheldMessage);
    expect(appleCheckoutButtonLabel(result), 'Pagar com Apple');
  });

  test('dados ausentes não lançam e não bloqueiam o texto de compra', () {
    expect(
      () => resolveIosStorePrice(
        displayPrice: null,
        currencyCode: null,
        currencySymbol: null,
        storefrontCountry: null,
      ),
      returnsNormally,
    );
    final missing = resolveIosStorePrice(
      displayPrice: null,
      currencyCode: null,
      currencySymbol: null,
      storefrontCountry: null,
    );
    expect(missing.status, IosStorePriceStatus.unavailable);
    expect(iosCheckoutAmountText(missing), kIosStorePriceWithheldMessage);
    expect(iosCheckoutAmountText(null), '');
    expect(appleCheckoutButtonLabel(missing), 'Pagar com Apple');
    expect(appleCheckoutButtonLabel(null), 'Pagar com Apple');
  });

  test('preço ou storefront ausente ficam sem valor', () {
    expect(
      resolveIosStorePrice(
        displayPrice: r'R$ 34,90',
        currencyCode: 'BRL',
        currencySymbol: r'R$',
        storefrontCountry: null,
      ).status,
      IosStorePriceStatus.unavailable,
    );
    expect(
      resolveIosStorePrice(
        displayPrice: '',
        currencyCode: 'BRL',
        currencySymbol: r'R$',
        storefrontCountry: 'BRA',
      ).status,
      IosStorePriceStatus.unavailable,
    );
    expect(
      resolveIosStorePrice(
        displayPrice: r'R$ 34,90',
        currencyCode: 'BRL',
        currencySymbol: r'R$',
        storefrontCountry: 'XXX',
      ).status,
      IosStorePriceStatus.unavailable,
    );
    expect(
      resolveIosStorePrice(
        displayPrice: '34,90',
        currencyCode: 'BRL',
        currencySymbol: '',
        storefrontCountry: 'BRA',
      ).status,
      IosStorePriceStatus.unavailable,
    );
    expect(appleCheckoutButtonLabel(null), 'Pagar com Apple');
  });

  test('sinais conflitantes não escolhem um preço', () {
    final result = resolveIosStorePrice(
      displayPrice: r'R$ 34,90',
      currencyCode: 'USD',
      currencySymbol: r'$',
      storefrontCountry: 'BRA',
    );
    expect(result.status, IosStorePriceStatus.unavailable);
    expect(result.label, isNull);
    expect(result.message, kIosStorePriceWithheldMessage);
  });
}
