import 'package:after_app/features/credits/publication_push_limits.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('título aceita 20 caracteres e bloqueia 21', () {
    expect(('a' * 20).length, PublicationPushLimits.titleMax);
    expect(('a' * 21).length, greaterThan(PublicationPushLimits.titleMax));
  });

  test('descrição mantém limite 60', () {
    expect(PublicationPushLimits.descriptionMax, 60);
  });
}