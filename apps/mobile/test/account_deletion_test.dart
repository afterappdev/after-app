import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/google_session.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/profile/delete_account_button.dart';
import 'package:after_app/features/public/account_deletion_pages.dart';
import 'package:after_app/features/public/account_deletion_uri.dart';

Widget _wrap(Widget child, {required ApiClient api, AuthController? auth}) {
  return MultiProvider(
    providers: [
      Provider.value(value: api),
      if (auth != null) ChangeNotifierProvider.value(value: auth),
    ],
    child: MaterialApp(home: child),
  );
}

Future<void> _useTallSurface(WidgetTester tester) async {
  tester.view.physicalSize = const Size(800, 2000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

/// Completes an in-flight HTTP call without waiting on infinite spinners.
Future<void> _pumpAsync(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

class _RecordingGoogleSession implements GoogleSessionCleaner {
  int signOuts = 0;
  int disconnects = 0;

  @override
  Future<void> signOut() async {
    signOuts += 1;
  }

  @override
  Future<void> disconnect() async {
    disconnects += 1;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('URI de confirmação lê o token do hash e não confunde outras rotas', () {
    final uri = Uri.parse(
      'https://app-after.com.br/#/confirmar-exclusao?token=abc_token',
    );
    expect(isAccountDeletionConfirmUri(uri), isTrue);
    expect(deletionConfirmTokenFromUri(uri), 'abc_token');
    expect(
      isAccountDeletionConfirmUri(Uri.parse('https://app-after.com.br/#/')),
      isFalse,
    );
  });

  testWidgets('página exclusão abre sem login', (tester) async {
    await _useTallSurface(tester);
    final api = ApiClient(
      client: MockClient((_) async => http.Response('{}', 200)),
    );
    await tester.pumpWidget(_wrap(const AccountDeletionPage(), api: api));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('deletion-page-title')), findsOneWidget);
    expect(find.text('Solicitar exclusão da conta'), findsOneWidget);
    expect(find.byKey(const Key('deletion-email')), findsOneWidget);
    expect(find.byType(AccountDeletionPage), findsOneWidget);
  });

  testWidgets('e-mail válido envia request e mostra mensagem genérica',
      (tester) async {
    await _useTallSurface(tester);
    late String body;
    final client = MockClient((req) async {
      body = req.body;
      return http.Response(
        jsonEncode({
          'message':
              'Se existir uma conta com esse e-mail, enviaremos instruções para exclusão.',
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = ApiClient(client: client);
    await tester.pumpWidget(_wrap(const AccountDeletionPage(), api: api));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('deletion-email')),
      'user@after.local',
    );
    await tester.ensureVisible(find.byKey(const Key('deletion-submit')));
    await tester.tap(find.byKey(const Key('deletion-submit')));
    await _pumpAsync(tester);

    expect(jsonDecode(body)['email'], 'user@after.local');
    expect(
      find.text(
        'Se existir uma conta com esse e-mail, enviaremos instruções para continuar.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('não encontrado'), findsNothing);
    expect(find.textContaining('inexistente'), findsNothing);
  });

  testWidgets('erro técnico não revela existência de conta', (tester) async {
    await _useTallSurface(tester);
    final api = ApiClient(
      client: MockClient(
        (_) async => http.Response('{"message":"fail"}', 503),
      ),
    );
    await tester.pumpWidget(_wrap(const AccountDeletionPage(), api: api));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('deletion-email')),
      'user@after.local',
    );
    await tester.ensureVisible(find.byKey(const Key('deletion-submit')));
    await tester.tap(find.byKey(const Key('deletion-submit')));
    await _pumpAsync(tester);
    expect(
      find.text(
        'Não foi possível enviar as instruções agora. Tente novamente mais tarde.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('não encontrado'), findsNothing);
    expect(find.textContaining('user-'), findsNothing);
  });

  testWidgets('página confirmar exclusão abre sem login', (tester) async {
    await _useTallSurface(tester);
    final api = ApiClient(
      client: MockClient((_) async {
        fail('não deve confirmar só por abrir o link');
      }),
    );
    await tester.pumpWidget(
      _wrap(const ConfirmAccountDeletionPage(token: 'secret-token'), api: api),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('deletion-confirm-title')), findsOneWidget);
    expect(find.text('Confirmar exclusão da minha conta'), findsOneWidget);
    expect(find.byKey(const Key('deletion-confirm-success')), findsNothing);
  });

  testWidgets('confirmação só ocorre após clique e sucesso mostra mensagem final',
      (tester) async {
    await _useTallSurface(tester);
    var called = false;
    final client = MockClient((req) async {
      called = true;
      expect(req.url.path, '/users/delete-confirm');
      expect(jsonDecode(req.body)['token'], 'secret-token');
      return http.Response(
        jsonEncode({'ok': true, 'message': 'Sua conta foi excluída.'}),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = ApiClient(client: client);
    await tester.pumpWidget(
      _wrap(const ConfirmAccountDeletionPage(token: 'secret-token'), api: api),
    );
    await tester.pumpAndSettle();
    expect(called, isFalse);

    await tester.ensureVisible(find.byKey(const Key('deletion-confirm-submit')));
    await tester.tap(find.byKey(const Key('deletion-confirm-submit')));
    await _pumpAsync(tester);

    expect(called, isTrue);
    expect(find.byKey(const Key('deletion-confirm-success')), findsOneWidget);
    expect(find.text('Sua conta foi excluída.'), findsOneWidget);
  });

  testWidgets('token inválido mostra erro amigável', (tester) async {
    await _useTallSurface(tester);
    final api = ApiClient(
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({'message': 'Este link é inválido ou já expirou.'}),
          400,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );
    await tester.pumpWidget(
      _wrap(const ConfirmAccountDeletionPage(token: 'bad-token'), api: api),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('deletion-confirm-submit')));
    await tester.tap(find.byKey(const Key('deletion-confirm-submit')));
    await _pumpAsync(tester);
    expect(find.byKey(const Key('deletion-confirm-error')), findsOneWidget);
    expect(find.text('Este link é inválido ou já expirou.'), findsOneWidget);
    expect(find.textContaining('stack'), findsNothing);
    expect(find.textContaining('Prisma'), findsNothing);
  });

  testWidgets('botão de exclusão autenticado do app continua funcionando',
      (tester) async {
    var deleted = false;
    final client = MockClient((req) async {
      if (req.method == 'DELETE' && req.url.path.endsWith('/users/me')) {
        deleted = true;
        return http.Response(
          jsonEncode({'ok': true}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });
    final api = ApiClient(client: client);
    final google = _RecordingGoogleSession();
    final auth = AuthController(
      api: api,
      storage: AuthStorage(),
      googleSession: google,
    );
    auth.bootstrapping = false;
    auth.user = UserSession(
      id: 'u1',
      name: 'Ana',
      email: 'ana@after.local',
      role: 'USER',
      state: 'SP',
      city: 'São Paulo',
    );
    api.setToken('jwt-test');

    await tester.pumpWidget(
      _wrap(const Scaffold(body: DeleteAccountButton()), api: api, auth: auth),
    );
    await tester.pump();
    await tester.tap(find.text('Excluir conta'));
    await tester.pump();
    await tester.tap(find.text('Sim'));
    await _pumpAsync(tester);
    expect(deleted, isTrue);
    expect(auth.user, isNull);
    expect(google.disconnects, 1);
    expect(google.signOuts, 1);
  });

  test('logout e exclusão limpam sessão e preferências locais', () async {
    SharedPreferences.setMockInitialValues({
      AuthStorage.tokenKey: 'jwt-test',
      AuthStorage.userJsonKey: jsonEncode({
        'id': 'u1',
        'name': 'Ana',
        'email': 'ana@after.local',
        'role': 'USER',
        'state': 'SP',
        'city': 'São Paulo',
      }),
      AuthStorage.notificationsLastPushedKey: 'n-99',
    });
    final google = _RecordingGoogleSession();
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.method == 'DELETE' && req.url.path.endsWith('/users/me')) {
          return http.Response(
            jsonEncode({'ok': true}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      }),
    );
    final storage = AuthStorage();
    final auth = AuthController(
      api: api,
      storage: storage,
      googleSession: google,
    );
    await auth.bootstrap();
    expect(auth.user?.id, 'u1');

    await auth.logout();
    expect(auth.user, isNull);
    expect(auth.pendingSocialOnboarding, isNull);
    expect(await storage.readToken(), isNull);
    expect(await storage.readUserJson(), isNull);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(AuthStorage.notificationsLastPushedKey), isNull);
    expect(google.signOuts, 1);
    expect(google.disconnects, 0);

    await storage.saveSession(
      token: 'jwt-2',
      userJson: jsonEncode({
        'id': 'u1',
        'name': 'Ana',
        'email': 'ana@after.local',
        'role': 'USER',
        'state': 'SP',
        'city': 'São Paulo',
      }),
    );
    await prefs.setString(AuthStorage.notificationsLastPushedKey, 'n-100');
    api.setToken('jwt-2');
    auth.user = UserSession(
      id: 'u1',
      name: 'Ana',
      email: 'ana@after.local',
      role: 'USER',
      state: 'SP',
      city: 'São Paulo',
    );

    await auth.deleteAccount();
    expect(auth.user, isNull);
    expect(await storage.readToken(), isNull);
    expect(prefs.getString(AuthStorage.notificationsLastPushedKey), isNull);
    expect(google.disconnects, 1);
    expect(google.signOuts, 2);
  });
}
