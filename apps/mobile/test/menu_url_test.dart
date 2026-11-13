import 'package:after_app/core/validation/menu_url.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('isPublicMenuUrl só aceita http/https com host', () {
    expect(isPublicMenuUrl('https://menu.test/a'), isTrue);
    expect(isPublicMenuUrl('http://menu.local/cardapio'), isTrue);
    expect(isPublicMenuUrl(''), isFalse);
    expect(isPublicMenuUrl('javascript:alert(1)'), isFalse);
    expect(isPublicMenuUrl('ftp://menu.test'), isFalse);
  });
}
