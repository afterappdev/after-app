/// Decisão de exibição do preço no checkout iOS.
///
/// O After é vendido somente na App Store do Brasil. O valor do StoreKit só é
/// exibido com storefront `BRA`, texto em real e metadados sem contradição. No
/// TestFlight, produto e storefront podem vir na visão dos EUA enquanto a
/// cobrança sai em reais, então qualquer outro caso oculta o número.
/// Não há conversão nem preço de catálogo aqui.
const String kIosStorePriceWithheldMessage =
    'O valor final será confirmado pela App Store';

const String _kStorefront = 'BRA';
const String _kCurrency = 'BRL';

enum IosStorePriceStatus { trusted, divergent, unavailable }

class IosStorePrice {
  const IosStorePrice._(this.status, this.label);

  const IosStorePrice.trusted(String label) : this._(IosStorePriceStatus.trusted, label);

  const IosStorePrice.divergent() : this._(IosStorePriceStatus.divergent, null);

  const IosStorePrice.unavailable() : this._(IosStorePriceStatus.unavailable, null);

  final IosStorePriceStatus status;
  final String? label;

  bool get showsAmount => status == IosStorePriceStatus.trusted && (label ?? '').isNotEmpty;

  String? get message => showsAmount ? null : kIosStorePriceWithheldMessage;
}

String appleCheckoutButtonLabel(IosStorePrice? price) {
  if (price != null && price.showsAmount) {
    return 'Pagar com Apple ${price.label}';
  }
  return 'Pagar com Apple';
}

/// Texto dos pontos que antes mostravam o valor. Sem preço confiável, a frase
/// ocupa esses pontos. `null` é o carregamento, ainda sem decisão.
String iosCheckoutAmountText(IosStorePrice? price) {
  if (price == null) return '';
  if (price.showsAmount) return price.label!;
  return kIosStorePriceWithheldMessage;
}

IosStorePrice resolveIosStorePrice({
  required String? displayPrice,
  required String? currencyCode,
  required String? currencySymbol,
  required String? storefrontCountry,
}) {
  final price = (displayPrice ?? '').trim();
  final code = (currencyCode ?? '').trim().toUpperCase();
  final symbol = (currencySymbol ?? '').trim();
  final country = (storefrontCountry ?? '').trim().toUpperCase();

  if (price.isEmpty || country.isEmpty) return const IosStorePrice.unavailable();
  if (country != _kStorefront) return const IosStorePrice.divergent();

  final markedReal = _hasRealMarker(price);
  final markedOther = _hasOtherCurrencyMarker(price);
  if (markedOther) return const IosStorePrice.divergent();
  if (!markedReal) return const IosStorePrice.unavailable();

  if (code.isNotEmpty && code != _kCurrency) return const IosStorePrice.divergent();
  if (symbol.isNotEmpty && symbol != r'R$' && symbol.toUpperCase() != _kCurrency) {
    return const IosStorePrice.divergent();
  }
  return IosStorePrice.trusted(price);
}

final RegExp _realSymbol = RegExp(r'(?<![A-Za-z$])R\$');
final RegExp _realIso = RegExp(r'(?<![A-Za-z])BRL(?![A-Za-z])', caseSensitive: false);
final RegExp _isoCode = RegExp(r'(?<![A-Za-z])[A-Za-z]{3}(?![A-Za-z])');
final RegExp _otherSymbol = RegExp(r'[$€£¥₩₹₺₽฿₫₱₪]');

bool _hasRealMarker(String price) => _realSymbol.hasMatch(price) || _realIso.hasMatch(price);

/// Após remover `R$` e `BRL`, qualquer cifrão, símbolo monetário ou sigla de
/// três letras indica outra moeda (`US$`, `$`, `USD`, `€`, `AR$`…).
bool _hasOtherCurrencyMarker(String price) {
  final rest = price.replaceAll(_realSymbol, ' ').replaceAll(_realIso, ' ');
  return _otherSymbol.hasMatch(rest) || _isoCode.hasMatch(rest);
}
