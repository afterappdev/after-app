/// Decisão de exibição do preço no checkout iOS.
///
/// A moeda esperada vem do storefront da Apple. O texto exibido só é aceito
/// quando o código ISO e esse storefront concordam, e a string do StoreKit
/// não aponta outra moeda. Não há conversão nem preço de catálogo aqui.
const String kIosStorePriceWithheldMessage =
    'O valor final será confirmado pela App Store';

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
  if (price.isEmpty || country.isEmpty) {
    return const IosStorePrice.unavailable();
  }

  final expected = _storefrontCurrency[country];
  if (expected == null) return const IosStorePrice.unavailable();

  final marked = _unambiguousCurrencies(price);
  if (marked.length > 1) return const IosStorePrice.unavailable();
  final markedCurrency = marked.isEmpty ? null : marked.first;

  if (markedCurrency != null && markedCurrency != expected) {
    return const IosStorePrice.divergent();
  }

  final codeKnown = _currencySymbols.containsKey(code);
  if (!codeKnown) return const IosStorePrice.unavailable();

  if (code != expected) {
    if (markedCurrency == expected) return const IosStorePrice.unavailable();
    if (markedCurrency == code || _stringMatchesCurrency(price, symbol, code)) {
      return const IosStorePrice.divergent();
    }
    return const IosStorePrice.unavailable();
  }

  if (markedCurrency == expected || _stringMatchesCurrency(price, symbol, code)) {
    return IosStorePrice.trusted(price);
  }
  return const IosStorePrice.unavailable();
}

bool _stringMatchesCurrency(String price, String symbol, String code) {
  if (symbol.isEmpty) return false;
  final allowed = _currencySymbols[code];
  if (allowed == null || !allowed.contains(symbol)) return false;
  return _containsBounded(price, symbol);
}

Set<String> _unambiguousCurrencies(String price) {
  final found = <String>{};
  for (final code in _currencySymbols.keys) {
    if (_containsIso(price, code)) found.add(code);
  }
  for (final entry in _explicitMarkers.entries) {
    for (final marker in entry.value) {
      if (_containsBounded(price, marker)) found.add(entry.key);
    }
  }
  return found;
}

bool _containsIso(String price, String code) {
  return RegExp('(?<![A-Za-z])$code(?![A-Za-z])', caseSensitive: false).hasMatch(price);
}

bool _containsBounded(String price, String token) {
  if (token.isEmpty) return false;
  var start = 0;
  while (true) {
    final index = price.indexOf(token, start);
    if (index < 0) return false;
    final beforeOk = index == 0 || !_isCurrencyChar(price[index - 1]);
    if (beforeOk) return true;
    start = index + 1;
  }
}

bool _isCurrencyChar(String char) {
  return RegExp(r'[A-Za-z\$€£¥₩₹₺₽฿₫₱₪]').hasMatch(char);
}

/// Símbolos aceitos para confirmar que a string pertence ao código ISO.
/// `$` sozinho não identifica a moeda; só confirma um código já compatível.
const Map<String, List<String>> _currencySymbols = {
  'BRL': ['R\$'],
  'USD': ['US\$', '\$'],
  'EUR': ['€', 'EUR'],
  'GBP': ['£', 'GBP'],
  'CAD': ['CA\$', 'C\$', '\$'],
  'AUD': ['A\$', 'AU\$', '\$'],
  'NZD': ['NZ\$', '\$'],
  'HKD': ['HK\$', '\$'],
  'SGD': ['S\$', '\$'],
  'MXN': ['MX\$', '\$'],
  'ARS': ['AR\$', '\$'],
  'CLP': ['\$', 'CLP'],
  'COP': ['\$', 'COP'],
  'PEN': ['S/', 'PEN'],
  'JPY': ['¥', 'JPY'],
  'CNY': ['¥', 'CN¥', 'CNY'],
  'KRW': ['₩', 'KRW'],
  'INR': ['₹', 'INR'],
  'TRY': ['₺', 'TRY'],
  'CHF': ['CHF'],
  'SEK': ['kr', 'SEK'],
  'NOK': ['kr', 'NOK'],
  'DKK': ['kr', 'DKK'],
  'PLN': ['zł', 'PLN'],
  'THB': ['฿', 'THB'],
  'VND': ['₫', 'VND'],
  'PHP': ['₱', 'PHP'],
  'ILS': ['₪', 'ILS'],
  'ZAR': ['ZAR'],
  'AED': ['AED'],
  'SAR': ['SAR'],
  'TWD': ['NT\$', 'TWD'],
};

/// Marcadores que identificam uma moeda sem ambiguidade com outro código.
const Map<String, List<String>> _explicitMarkers = {
  'BRL': ['R\$'],
  'USD': ['US\$'],
  'EUR': ['€'],
  'GBP': ['£'],
  'CAD': ['CA\$', 'C\$'],
  'AUD': ['A\$', 'AU\$'],
  'NZD': ['NZ\$'],
  'HKD': ['HK\$'],
  'SGD': ['S\$'],
  'MXN': ['MX\$'],
  'ARS': ['AR\$'],
  'TWD': ['NT\$'],
  'KRW': ['₩'],
  'INR': ['₹'],
  'TRY': ['₺'],
  'PLN': ['zł'],
  'THB': ['฿'],
  'VND': ['₫'],
  'PHP': ['₱'],
  'ILS': ['₪'],
};

/// Região do storefront (ISO 3166-1 alfa-3) → moeda cobrada. Não é tabela de preço.
const Map<String, String> _storefrontCurrency = {
  'USA': 'USD',
  'BRA': 'BRL',
  'CAN': 'CAD',
  'MEX': 'MXN',
  'ARG': 'ARS',
  'CHL': 'CLP',
  'COL': 'COP',
  'PER': 'PEN',
  'GBR': 'GBP',
  'IRL': 'EUR',
  'FRA': 'EUR',
  'DEU': 'EUR',
  'ESP': 'EUR',
  'ITA': 'EUR',
  'PRT': 'EUR',
  'NLD': 'EUR',
  'BEL': 'EUR',
  'AUT': 'EUR',
  'FIN': 'EUR',
  'GRC': 'EUR',
  'LUX': 'EUR',
  'SVK': 'EUR',
  'SVN': 'EUR',
  'EST': 'EUR',
  'LVA': 'EUR',
  'LTU': 'EUR',
  'HRV': 'EUR',
  'CYP': 'EUR',
  'MLT': 'EUR',
  'BGR': 'EUR',
  'CHE': 'CHF',
  'NOR': 'NOK',
  'SWE': 'SEK',
  'DNK': 'DKK',
  'POL': 'PLN',
  'TUR': 'TRY',
  'ISR': 'ILS',
  'ARE': 'AED',
  'SAU': 'SAR',
  'ZAF': 'ZAR',
  'AUS': 'AUD',
  'NZL': 'NZD',
  'JPN': 'JPY',
  'KOR': 'KRW',
  'CHN': 'CNY',
  'HKG': 'HKD',
  'TWN': 'TWD',
  'SGP': 'SGD',
  'THA': 'THB',
  'PHL': 'PHP',
  'VNM': 'VND',
  'IND': 'INR',
};
