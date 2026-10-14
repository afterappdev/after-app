import 'package:after_admin/core/network/api_client.dart';
import 'package:after_admin/core/push/admin_push_coordinator.dart';
import 'package:after_admin/core/storage/secure_token_store.dart';
import 'package:after_admin/data/admin_session.dart';
import 'package:after_admin/features/auth/auth_controller.dart';
import 'package:after_admin/main.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'fake_push_messaging.dart';
import 'helpers.dart';

void main() {
  test('login válido armazena JWT e carrega /admin/me', () async {
    final storage = MemoryTokenStore();
    final client = ApiClient(baseUrl: 'http://localhost');
    final api = FakeAdminApi(
      loginHandler: (email, password) async {
        expect(email, 'admin@after.local');
        expect(password, 'secret1');
        return const AdminLoginResult(
          accessToken: 'jwt-admin',
          user: AdminMe(id: 'a1', email: 'admin@after.local', role: 'ADMIN'),
        );
      },
      meHandler: () async =>
          const AdminMe(id: 'a1', email: 'admin@after.local', role: 'ADMIN'),
    );
    final auth = AuthController(api: api, client: client, storage: storage);
    final ok = await auth.login(
      email: 'admin@after.local',
      password: 'secret1',
    );
    expect(ok, isTrue);
    expect(storage.token, 'jwt-admin');
    expect(auth.user?.email, 'admin@after.local');
    expect(auth.isAuthenticated, isTrue);
  });

  test('erro de login não autentica e não guarda token', () async {
    final storage = MemoryTokenStore();
    final client = ApiClient(baseUrl: 'http://localhost');
    final api = FakeAdminApi(
      loginHandler: (email, password) async {
        throw ApiException('Credenciais inválidas', statusCode: 401);
      },
    );
    final auth = AuthController(api: api, client: client, storage: storage);
    final ok = await auth.login(
      email: 'user@after.local',
      password: 'senha123',
    );
    expect(ok, isFalse);
    expect(auth.error, 'Credenciais inválidas');
    expect(storage.token, isNull);
    expect(auth.isAuthenticated, isFalse);
  });

  test('token inválido limpa sessão e volta ao login', () async {
    final storage = MemoryTokenStore()..token = 'expired';
    final client = ApiClient(baseUrl: 'http://localhost');
    final api = FakeAdminApi(
      meHandler: () async {
        throw ApiException(
          'Sessão expirada. Entre novamente.',
          statusCode: 401,
        );
      },
    );
    final auth = AuthController(api: api, client: client, storage: storage);
    await auth.bootstrap();
    expect(auth.isAuthenticated, isFalse);
    expect(storage.token, isNull);
    expect(auth.bootstrapping, isFalse);
  });

  test('inicialização sem sessão permanece deslogada', () async {
    final storage = MemoryTokenStore();
    final auth = AuthController(
      api: FakeAdminApi(),
      client: ApiClient(baseUrl: 'http://localhost'),
      storage: storage,
    );
    await auth.bootstrap();
    expect(auth.bootstrapping, isFalse);
    expect(auth.isAuthenticated, isFalse);
    expect(storage.token, isNull);
  });

  test('inicialização com sessão válida restaura o administrador', () async {
    final storage = MemoryTokenStore()..token = 'jwt-admin';
    final auth = AuthController(
      api: FakeAdminApi(
        meHandler: () async => const AdminMe(
          id: 'a1',
          email: 'admin@after.local',
          role: 'ADMIN',
        ),
      ),
      client: ApiClient(baseUrl: 'http://localhost'),
      storage: storage,
    );
    await auth.bootstrap();
    expect(auth.bootstrapping, isFalse);
    expect(auth.isAuthenticated, isTrue);
    expect(auth.user?.email, 'admin@after.local');
    expect(storage.token, 'jwt-admin');
  });

  test('token ilegível descarta a sessão e conclui a inicialização', () async {
    final storage = _UnreadableTokenStore();
    final auth = AuthController(
      api: FakeAdminApi(),
      client: ApiClient(baseUrl: 'http://localhost'),
      storage: storage,
    );
    await auth.bootstrap();
    expect(auth.bootstrapping, isFalse);
    expect(auth.isAuthenticated, isFalse);
    expect(storage.cleared, isTrue);
  });

  test('falha de armazenamento não relacionada continua visível', () async {
    final auth = AuthController(
      api: FakeAdminApi(),
      client: ApiClient(baseUrl: 'http://localhost'),
      storage: _BrokenTokenStore(),
    );
    await expectLater(
      auth.bootstrap(),
      throwsA(
        isA<PlatformException>().having(
          (error) => error.code,
          'code',
          'MissingPlugin',
        ),
      ),
    );
  });

  testWidgets('falha recuperável abre a tela de login', (tester) async {
    final auth = AuthController(
      api: FakeAdminApi(),
      client: ApiClient(baseUrl: 'http://localhost'),
      storage: _UnreadableTokenStore(),
    );
    await auth.bootstrap();
    final push = AdminPushCoordinator(
      api: FakeAdminApi(),
      messaging: FakePushMessaging(),
    );
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthController>.value(value: auth),
          ChangeNotifierProvider<AdminPushCoordinator>.value(value: push),
        ],
        child: const AfterAdminApp(),
      ),
    );
    expect(find.text('ENTRAR'), findsOneWidget);
    expect(auth.bootstrapping, isFalse);
    expect(auth.isAuthenticated, isFalse);
  });
}

class _UnreadableTokenStore implements TokenStore {
  bool cleared = false;

  @override
  Future<void> clear() async => cleared = true;

  @override
  Future<String?> readToken() {
    throw PlatformException(
      code: 'Exception encountered',
      message: 'read',
      details:
          'javax.crypto.BadPaddingException: error:1e000065:Cipher functions:OPENSSL_internal:BAD_DECRYPT',
    );
  }

  @override
  Future<void> saveToken(String token) async {}
}

class _BrokenTokenStore implements TokenStore {
  @override
  Future<void> clear() async {}

  @override
  Future<String?> readToken() {
    throw PlatformException(code: 'MissingPlugin', message: 'read');
  }

  @override
  Future<void> saveToken(String token) async {}
}
