import 'package:after_admin/core/storage/secure_token_store.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel(
    'plugins.it_nomads.com/flutter_secure_storage',
  );
  final data = <String, String>{};
  final deletedKeys = <String>[];
  var deleteAllCalled = false;
  String? failureCode;

  setUp(() {
    data.clear();
    deletedKeys.clear();
    deleteAllCalled = false;
    failureCode = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          final args = Map<String, dynamic>.from(call.arguments as Map);
          switch (call.method) {
            case 'write':
              data[args['key'] as String] = args['value'] as String;
              return null;
            case 'read':
              if (failureCode != null) {
                throw PlatformException(
                  code: failureCode!,
                  message: 'read',
                  details:
                      'javax.crypto.BadPaddingException: error:1e000065:Cipher functions:OPENSSL_internal:BAD_DECRYPT',
                );
              }
              return data[args['key'] as String];
            case 'delete':
              final key = args['key'] as String;
              deletedKeys.add(key);
              data.remove(key);
              return null;
            case 'deleteAll':
              deleteAllCalled = true;
              data.clear();
              return null;
            default:
              return null;
          }
        });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('token válido é lido normalmente', () async {
    final store = SecureTokenStore(storage: const FlutterSecureStorage());

    await store.saveToken('jwt-admin');

    expect(await store.readToken(), 'jwt-admin');
    expect(data['after_admin.access_token'], 'jwt-admin');
    expect(deletedKeys, isEmpty);
  });

  test('token inexistente retorna null', () async {
    final store = SecureTokenStore(storage: const FlutterSecureStorage());

    expect(await store.readToken(), isNull);
    expect(deletedKeys, isEmpty);
  });

  test('token ilegível é descartado e os demais segredos permanecem', () async {
    data['after_admin.access_token'] = 'ciphertext';
    data['other.secret'] = 'manter';
    failureCode = 'Exception encountered';
    final store = SecureTokenStore(storage: const FlutterSecureStorage());

    expect(await store.readToken(), isNull);
    expect(deletedKeys, ['after_admin.access_token']);
    expect(deleteAllCalled, isFalse);
    expect(data['other.secret'], 'manter');
    expect(data.containsKey('after_admin.access_token'), isFalse);
  });

  test('falha de armazenamento não relacionada continua visível', () async {
    failureCode = 'MissingPlugin';
    final store = SecureTokenStore(storage: const FlutterSecureStorage());

    await expectLater(
      store.readToken(),
      throwsA(
        isA<PlatformException>().having(
          (error) => error.code,
          'code',
          'MissingPlugin',
        ),
      ),
    );
    expect(deletedKeys, isEmpty);
    expect(deleteAllCalled, isFalse);
  });
}
