import 'package:after_app/core/push/firebase_options_env.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('sem dart-defines Firebase client fica nulo', () {
    expect(firebaseOptionsFromEnvironment(), isNull);
    expect(firebaseClientConfiguredFromEnvironment, isFalse);
  });
}
