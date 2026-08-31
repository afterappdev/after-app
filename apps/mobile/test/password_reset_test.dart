import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/auth/oauth_callback.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/core/router/app_router.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/login_screen.dart';
import 'package:after_app/features/auth/password_reset_pages.dart';
import 'package:after_app/features/auth/password_reset_uri.dart';
import 'package:after_app/features/public/web_root.dart';

Widget _wrap(
  Widget child, {
  required ApiClient api,
  AuthController? auth,
  Map<String, WidgetBuilder>? extraRoutes,
}) {
  return MultiProvider(
    providers: [
      Provider.value(value: api),
      if (auth != null) ChangeNotifierProvider.value(value: auth),
    ],
    child: MaterialApp(
      home: child,
      routes: {
        AppRoutes.login: (_) => const LoginScreenRoute(),
        AppRoutes.forgotPassword: (_) => const ForgotPasswordPage(),
        AppRoutes.resetPassword: (_) => const ResetPasswordPage(),
        ...?extraRoutes,
      },
    ),
  );
}

Future<void> _useTallSurface(WidgetTester tester) async {
  tester.view.physicalSize = const Size(800, 2000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Future<void> _pumpAsync(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('Google Web usa origin oficial no redirect', () {
    expect(
      oauthBrowserRedirect(
        isWeb: true,
        pageUri: Uri.parse('https://app-after.com.br/#/login'),
      ),
      'https://app-after.com.br/',
    );
    expect(
      oauthBrowserRedirect(
        isWeb: false,
        pageUri: Uri.parse('https://app-after.com.br/'),
      ),
      'after://auth/callback',
    );
  });

  testWidgets('Esqueci minha senha abre a nova página', (tester) async {
    await _useTallSurface(tester);
    final api = ApiClient(client: MockClient((_) async => http.Response('{}', 200)));
    final auth = AuthController(api: api, storage: AuthStorage());
    auth.bootstrapping = false;
    await tester.pumpWidget(
      _wrap(const LoginScreen(), api: api, auth: auth),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('forgot-password')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('forgot-page-title')), findsOneWidget);
    expect(find.text('Enviar instruções'), findsOneWidget);
  });

  testWidgets('request de recuperação mostra resposta genérica', (tester) async {
    await _useTallSurface(tester);
    final client = MockClient((req) async {
      expect(req.url.path, '/auth/password-reset/request');
      return http.Response(
        jsonEncode({
          'message':
              'Se existir uma conta elegível com esse e-mail, enviaremos instruções para redefinir a senha.',
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = ApiClient(client: client);
    await tester.pumpWidget(_wrap(const ForgotPasswordPage(), api: api));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('forgot-email')),
      'user@after.local',
    );
    await tester.ensureVisible(find.byKey(const Key('forgot-submit')));
    await tester.tap(find.byKey(const Key('forgot-submit')));
    await _pumpAsync(tester);
    expect(
      find.text(
        'Se existir uma conta elegível com esse e-mail, enviaremos instruções para redefinir a senha.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('não encontrado'), findsNothing);
    expect(find.textContaining('Google'), findsNothing);
  });

  testWidgets('reset exige duas senhas iguais e não dispara só ao abrir o link',
      (tester) async {
    await _useTallSurface(tester);
    var called = false;
    final api = ApiClient(
      client: MockClient((req) async {
        called = true;
        return http.Response('{}', 200);
      }),
    );
    await tester.pumpWidget(
      _wrap(const ResetPasswordPage(token: 'secret-token'), api: api),
    );
    await tester.pumpAndSettle();
    expect(called, isFalse);

    await tester.enterText(find.byKey(const Key('reset-password')), 'abc123');
    await tester.enterText(
      find.byKey(const Key('reset-password-confirm')),
      'diferente',
    );
    await tester.ensureVisible(find.byKey(const Key('reset-submit')));
    await tester.tap(find.byKey(const Key('reset-submit')));
    await _pumpAsync(tester);
    expect(called, isFalse);
    expect(find.text('As senhas não coincidem.'), findsOneWidget);
  });

  testWidgets('sucesso da redefinição volta ao login', (tester) async {
    await _useTallSurface(tester);
    final api = ApiClient(
      client: MockClient((req) async {
        expect(req.url.path, '/auth/password-reset/confirm');
        return http.Response(
          jsonEncode({'ok': true, 'message': 'Sua senha foi redefinida.'}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final auth = AuthController(api: api, storage: AuthStorage());
    auth.bootstrapping = false;
    await tester.pumpWidget(
      _wrap(
        const ResetPasswordPage(token: 'secret-token'),
        api: api,
        auth: auth,
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('reset-password')), 'novaSenha');
    await tester.enterText(
      find.byKey(const Key('reset-password-confirm')),
      'novaSenha',
    );
    await tester.tap(find.byKey(const Key('reset-submit')));
    await _pumpAsync(tester);
    expect(find.byKey(const Key('reset-success')), findsOneWidget);

    await tester.tap(find.byKey(const Key('reset-back-login')));
    await tester.pumpAndSettle();
    expect(find.byType(LoginScreen), findsOneWidget);
  });

  testWidgets('login e-mail/senha continua funcionando', (tester) async {
    await _useTallSurface(tester);
    var logged = false;
    final client = MockClient((req) async {
      if (req.method == 'POST' && req.url.path.endsWith('/auth/login')) {
        logged = true;
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        expect(body['email'], 'ana@after.local');
        expect(body['password'], 'senha123');
        return http.Response(
          jsonEncode({
            'accessToken': 'jwt-test',
            'user': {
              'id': 'u1',
              'name': 'Ana',
              'email': 'ana@after.local',
              'role': 'USER',
              'state': 'SP',
              'city': 'São Paulo',
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });
    final api = ApiClient(client: client);
    final auth = AuthController(api: api, storage: AuthStorage());
    auth.bootstrapping = false;
    await tester.pumpWidget(_wrap(const LoginScreen(), api: api, auth: auth));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('login-email')), 'ana@after.local');
    await tester.enterText(find.byKey(const Key('login-password')), 'senha123');
    await tester.tap(find.text('Entrar'));
    await _pumpAsync(tester);
    expect(logged, isTrue);
    expect(auth.user?.email, 'ana@after.local');
  });

  test('URI de redefinição lê o token do hash e não vira OAuth', () {
    final uri = Uri.parse(
      'https://app-after.com.br/#/redefinir-senha?token=abc_token',
    );
    expect(isPasswordResetUri(uri), isTrue);
    expect(passwordResetTokenFromUri(uri), 'abc_token');
  });
}
