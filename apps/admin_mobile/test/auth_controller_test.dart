import 'package:after_admin/core/network/api_client.dart';
import 'package:after_admin/data/admin_session.dart';
import 'package:after_admin/features/auth/auth_controller.dart';
import 'package:flutter_test/flutter_test.dart';

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
  });
}
