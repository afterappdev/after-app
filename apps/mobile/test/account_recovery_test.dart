import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/account_recovery_screen.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/google_session.dart';
import 'package:after_app/features/auth/models/deletion_status.dart';
import 'package:after_app/features/intro/app_startup.dart';

class _NoOpGoogleSession implements GoogleSessionCleaner {
  @override
  Future<void> disconnect() async {}

  @override
  Future<void> signOut() async {}
}

Widget _wrap(Widget child, AuthController auth, ApiClient api) {
  return MultiProvider(
    providers: [
      Provider.value(value: api),
      ChangeNotifierProvider.value(value: auth),
    ],
    child: MaterialApp(home: child),
  );
}

PendingAccountRecovery _pending({int remainingSeconds = 86400 * 10}) {
  return PendingAccountRecovery(
    recoveryToken: 'recovery-jwt',
    status: DeletionStatus(
      accountStatus: 'PENDING_DELETION',
      remainingSeconds: remainingSeconds,
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('AppStartup mostra recuperação quando há conta pendente',
      (tester) async {
    final api = ApiClient(
      client: MockClient((_) async => http.Response('{}', 404)),
    );
    final auth = AuthController(
      api: api,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    );
    auth.bootstrapping = false;
    auth.pendingAccountRecovery = _pending();

    await tester.pumpWidget(_wrap(const AppStartup(), auth, api));
    await tester.pumpAndSettle();

    expect(find.byType(AccountRecoveryScreen), findsOneWidget);
    expect(find.byKey(const Key('recovery-title')), findsOneWidget);
    expect(find.text('Recuperar minha conta'), findsOneWidget);
  });

  testWidgets('prazo restante vem da API, não do relógio local', (tester) async {
    final api = ApiClient(
      client: MockClient((_) async => http.Response('{}', 404)),
    );
    final auth = AuthController(
      api: api,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    );
    auth.bootstrapping = false;
    auth.pendingAccountRecovery = _pending(remainingSeconds: 86400 * 2 + 3600);

    await tester.pumpWidget(
      _wrap(const AccountRecoveryScreen(), auth, api),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('recovery-remaining')), findsOneWidget);
    expect(find.textContaining('2 dias'), findsOneWidget);
  });

  testWidgets('recuperação bem-sucedida limpa pendência e prepara login',
      (tester) async {
    var cancelCalled = false;
    final client = MockClient((req) async {
      if (req.method == 'POST' &&
          req.url.path.endsWith('/users/me/deletion-cancel')) {
        cancelCalled = true;
        expect(req.headers['authorization'], 'Bearer recovery-jwt');
        return http.Response(jsonEncode({'ok': true}), 200);
      }
      return http.Response('{}', 404);
    });
    final api = ApiClient(client: client);
    final auth = AuthController(
      api: api,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    );
    auth.bootstrapping = false;
    auth.pendingAccountRecovery = _pending();

    await tester.pumpWidget(
      _wrap(const AccountRecoveryScreen(), auth, api),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('recovery-confirm')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(cancelCalled, isTrue);
    expect(auth.pendingAccountRecovery, isNull);
    expect(auth.user, isNull);
    expect(auth.takePostRecoveryLoginMessage(), isNotEmpty);
  });

  testWidgets('manter exclusão descarta token e volta ao login', (tester) async {
    final api = ApiClient(
      client: MockClient((_) async => http.Response('{}', 404)),
    );
    final auth = AuthController(
      api: api,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    );
    auth.bootstrapping = false;
    auth.pendingAccountRecovery = _pending();

    await tester.pumpWidget(_wrap(const AppStartup(), auth, api));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('recovery-keep-deletion')));
    await tester.pumpAndSettle();

    expect(auth.pendingAccountRecovery, isNull);
    expect(find.byType(AccountRecoveryScreen), findsNothing);
  });

  testWidgets('conta fora do prazo não oferece recuperação', (tester) async {
    final api = ApiClient(
      client: MockClient((_) async => http.Response('{}', 404)),
    );
    final auth = AuthController(
      api: api,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    );
    auth.bootstrapping = false;
    auth.pendingAccountRecovery = _pending(remainingSeconds: 0);

    await tester.pumpWidget(
      _wrap(const AccountRecoveryScreen(), auth, api),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('recovery-expired')), findsOneWidget);
    expect(find.byKey(const Key('recovery-confirm')), findsNothing);
  });

  test('login com conta pendente não persiste sessão normal', () async {
    final client = MockClient((req) async {
      if (req.url.path.endsWith('/auth/login')) {
        return http.Response(
          jsonEncode({
            'accountPendingDeletion': true,
            'recoveryToken': 'recovery-jwt',
            'deletionStatus': {
              'accountStatus': 'PENDING_DELETION',
              'remainingSeconds': 500000,
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });
    final api = ApiClient(client: client);
    final storage = AuthStorage();
    final auth = AuthController(
      api: api,
      storage: storage,
      googleSession: _NoOpGoogleSession(),
    );

    await auth.login(email: 'a@b.com', password: 'secret');
    expect(auth.user, isNull);
    expect(await storage.readToken(), isNull);
    expect(auth.pendingAccountRecovery?.recoveryToken, 'recovery-jwt');
  });

  test('login normal continua persistindo sessão', () async {
    final client = MockClient((req) async {
      if (req.url.path.endsWith('/auth/login')) {
        return http.Response(
          jsonEncode({
            'accessToken': 'access-jwt',
            'user': {
              'id': 'u1',
              'name': 'Ana',
              'email': 'ana@after.local',
              'role': 'USER',
              'state': 'SP',
              'city': 'Campinas',
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });
    final api = ApiClient(client: client);
    final auth = AuthController(
      api: api,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    );

    await auth.login(email: 'ana@after.local', password: 'secret');
    expect(auth.user?.id, 'u1');
    expect(auth.pendingAccountRecovery, isNull);
  });

  test('login Google pendente abre fluxo de recuperação', () async {
    final client = MockClient((req) async {
      if (req.url.path.endsWith('/auth/google')) {
        return http.Response(
          jsonEncode({
            'accountPendingDeletion': true,
            'recoveryToken': 'g-recovery',
            'deletionStatus': {
              'accountStatus': 'PENDING_DELETION',
              'remainingSeconds': 1000,
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });
    final api = ApiClient(client: client);
    final auth = AuthController(
      api: api,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    );

    await auth.loginWithGoogle(idToken: 'google-id');
    expect(auth.pendingAccountRecovery?.recoveryToken, 'g-recovery');
    expect(auth.user, isNull);
  });

  testWidgets('token recovery expirado mostra mensagem amigável', (tester) async {
    final client = MockClient((req) async {
      if (req.method == 'POST' &&
          req.url.path.endsWith('/users/me/deletion-cancel')) {
        return http.Response(
          jsonEncode({'message': 'Unauthorized'}),
          401,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });
    final api = ApiClient(client: client);
    final auth = AuthController(
      api: api,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    );
    auth.bootstrapping = false;
    auth.pendingAccountRecovery = _pending();

    await tester.pumpWidget(
      _wrap(const AccountRecoveryScreen(), auth, api),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('recovery-confirm')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.textContaining('sessão de recuperação expirou'),
      findsOneWidget,
    );
  });

  test('login Apple pendente abre fluxo de recuperação', () async {
    final client = MockClient((req) async {
      if (req.url.path.endsWith('/auth/apple')) {
        return http.Response(
          jsonEncode({
            'accountPendingDeletion': true,
            'recoveryToken': 'a-recovery',
            'deletionStatus': {
              'accountStatus': 'PENDING_DELETION',
              'remainingSeconds': 1000,
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });
    final api = ApiClient(client: client);
    final auth = AuthController(
      api: api,
      storage: AuthStorage(),
      googleSession: _NoOpGoogleSession(),
    );

    await auth.loginWithApple(identityToken: 'apple-id');
    expect(auth.pendingAccountRecovery?.recoveryToken, 'a-recovery');
  });
}
