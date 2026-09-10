import 'package:after_admin/core/network/api_client.dart';
import 'package:after_admin/core/push/admin_push_coordinator.dart';
import 'package:after_admin/core/push/push_navigation.dart';
import 'package:after_admin/core/push/push_payload.dart';
import 'package:after_admin/data/admin_api.dart';
import 'package:after_admin/data/admin_session.dart';
import 'package:after_admin/features/auth/auth_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'fake_push_messaging.dart';
import 'helpers.dart';

void main() {
  test('parsing seguro do payload administrativo', () {
    expect(
      parseAdminPushData({'type': 'ACCOUNT_CREATED', 'entityId': 'user-1'})?.id,
      'user-1',
    );
    expect(
      parseAdminPushData({
        'type': 'VENUE_CREATED',
        'entityId': 'venue-1',
        'accountId': 'user-9',
      })?.id,
      'user-9',
    );
    expect(
      parseAdminPushData({'type': 'PURCHASE_PAID', 'entityId': 'sale-3'})?.kind,
      PushNavKind.sale,
    );
    expect(parseAdminPushData({'type': 'UNKNOWN', 'entityId': 'x'}), isNull);
    expect(parseAdminPushData({}), isNull);
    expect(parseAdminPushData(null), isNull);
  });

  test('registro do FCM token após login', () async {
    final api = FakeAdminApi(
      loginHandler: (email, password) async => const AdminLoginResult(
        accessToken: 'jwt-admin',
        user: AdminMe(id: 'a1', email: 'admin@after.local', role: 'ADMIN'),
      ),
      meHandler: () async =>
          const AdminMe(id: 'a1', email: 'admin@after.local', role: 'ADMIN'),
    );
    final messaging = FakePushMessaging();
    final push = AdminPushCoordinator(api: api, messaging: messaging);
    final auth = AuthController(
      api: api,
      client: ApiClient(baseUrl: 'http://localhost'),
      storage: MemoryTokenStore(),
      push: push,
    );
    await auth.login(email: 'admin@after.local', password: 'secret1');
    expect(api.registeredTokens, isNotEmpty);
    expect(api.registeredTokens.first.token, 'fcm-test-token-123456');
    expect(api.registeredTokens.first.platform, 'android');
  });

  test('token refresh registra o novo token', () async {
    final api = FakeAdminApi();
    final messaging = FakePushMessaging();
    final push = AdminPushCoordinator(api: api, messaging: messaging);
    await push.start();
    expect(api.registeredTokens, hasLength(1));
    messaging.tokenRefresh.add('fcm-refreshed-token-999');
    await Future<void>.delayed(Duration.zero);
    expect(api.registeredTokens.last.token, 'fcm-refreshed-token-999');
  });

  test('logout envia DELETE do token FCM', () async {
    final api = FakeAdminApi(
      loginHandler: (email, password) async => const AdminLoginResult(
        accessToken: 'jwt-admin',
        user: AdminMe(id: 'a1', email: 'admin@after.local', role: 'ADMIN'),
      ),
      meHandler: () async =>
          const AdminMe(id: 'a1', email: 'admin@after.local', role: 'ADMIN'),
    );
    final messaging = FakePushMessaging();
    final auth = AuthController(
      api: api,
      client: ApiClient(baseUrl: 'http://localhost'),
      storage: MemoryTokenStore(),
      push: AdminPushCoordinator(api: api, messaging: messaging),
    );
    await auth.login(email: 'admin@after.local', password: 'secret1');
    await auth.logout();
    expect(api.unregisteredTokens, ['fcm-test-token-123456']);
    expect(auth.isAuthenticated, isFalse);
  });

  test('logout remove o token mesmo se a rede falhar', () async {
    final api = FakeAdminApi(
      loginHandler: (email, password) async => const AdminLoginResult(
        accessToken: 'jwt-admin',
        user: AdminMe(id: 'a1', email: 'admin@after.local', role: 'ADMIN'),
      ),
      meHandler: () async =>
          const AdminMe(id: 'a1', email: 'admin@after.local', role: 'ADMIN'),
    );
    final messaging = FakePushMessaging();
    final storage = MemoryTokenStore();
    final push = AdminPushCoordinator(api: api, messaging: messaging);
    final auth = AuthController(
      api: api,
      client: ApiClient(baseUrl: 'http://localhost'),
      storage: storage,
      push: push,
    );
    await auth.login(email: 'admin@after.local', password: 'secret1');
    api.failUnregister = true;
    await auth.logout();
    expect(auth.isAuthenticated, isFalse);
    expect(storage.token, isNull);
  });

  test('falha de permissão não quebra o app', () async {
    final api = FakeAdminApi(
      loginHandler: (email, password) async => const AdminLoginResult(
        accessToken: 'jwt-admin',
        user: AdminMe(id: 'a1', email: 'admin@after.local', role: 'ADMIN'),
      ),
      meHandler: () async =>
          const AdminMe(id: 'a1', email: 'admin@after.local', role: 'ADMIN'),
    );
    final messaging = FakePushMessaging(permissionGranted: false);
    final push = AdminPushCoordinator(api: api, messaging: messaging);
    final auth = AuthController(
      api: api,
      client: ApiClient(baseUrl: 'http://localhost'),
      storage: MemoryTokenStore(),
      push: push,
    );
    final ok = await auth.login(
      email: 'admin@after.local',
      password: 'secret1',
    );
    expect(ok, isTrue);
    expect(auth.isAuthenticated, isTrue);
    expect(push.permissionDenied, isTrue);
    expect(api.registeredTokens, isEmpty);
  });

  testWidgets('ACCOUNT_CREATED abre detalhe de conta', (tester) async {
    await tester.pumpWidget(
      Provider<AdminApi>.value(
        value: FakeAdminApi(),
        child: MaterialApp(
          home: Builder(
            builder: (context) {
              return Scaffold(
                body: TextButton(
                  onPressed: () => openAdminPushTarget(
                    context,
                    const PushNavTarget(
                      kind: PushNavKind.account,
                      id: 'user-1',
                    ),
                  ),
                  child: const Text('go'),
                ),
              );
            },
          ),
        ),
      ),
    );
    await tester.tap(find.text('go'));
    await tester.pump();
    await tester.pump();
    expect(find.text('Conta'), findsOneWidget);
  });

  testWidgets('PURCHASE_PAID abre detalhe da venda', (tester) async {
    await tester.pumpWidget(
      Provider<AdminApi>.value(
        value: FakeAdminApi(),
        child: MaterialApp(
          home: Builder(
            builder: (context) {
              return Scaffold(
                body: TextButton(
                  onPressed: () => openAdminPushTarget(
                    context,
                    const PushNavTarget(kind: PushNavKind.sale, id: 'sale-1'),
                  ),
                  child: const Text('go'),
                ),
              );
            },
          ),
        ),
      ),
    );
    await tester.tap(find.text('go'));
    await tester.pump();
    await tester.pump();
    expect(find.text('Venda'), findsOneWidget);
  });
}
