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
import 'package:after_app/features/auth/models/social_onboarding.dart';
import 'package:after_app/features/auth/register_screen.dart';
import 'package:after_app/features/public/web_root.dart';

const _jsonHeaders = {'content-type': 'application/json'};

String _fakeOnboardingJwt({
  String email = 'nova@gmail.com',
  String name = 'Nova Silva',
  String provider = 'google',
  String? avatarUrl = 'https://example.com/avatar.png',
}) {
  String encode(Map<String, dynamic> json) =>
      base64Url.encode(utf8.encode(jsonEncode(json))).replaceAll('=', '');
  return '${encode({'alg': 'none', 'typ': 'JWT'})}.'
      '${encode({
        'typ': 'social_onboarding',
        'provider': provider,
        'providerId': provider == 'google' ? 'gid-new' : 'aid-new',
        'email': email,
        'name': name,
        'avatarUrl': avatarUrl,
      })}.sig';
}

Map<String, dynamic> _sessionBody({
  String role = 'USER',
  String? venueId,
}) =>
    {
      'accessToken': 'session-jwt',
      'user': {
        'id': 'u1',
        'name': 'Nova Silva',
        'email': 'nova@gmail.com',
        'role': role,
        'state': 'SP',
        'city': 'São Paulo',
        'avatarUrl': null,
        'venueId': venueId,
      },
    };

Widget _app({
  required ApiClient api,
  required AuthController auth,
  String initialRoute = AppRoutes.login,
}) {
  return MultiProvider(
    providers: [
      Provider.value(value: api),
      ChangeNotifierProvider.value(value: auth),
    ],
    child: MaterialApp(
      initialRoute: initialRoute,
      routes: {
        AppRoutes.login: (_) => const LoginScreenRoute(),
        AppRoutes.register: (_) => const RegisterScreen(),
        AppRoutes.home: (_) => const Scaffold(body: Text('HOME')),
      },
    ),
  );
}

Future<void> _useTallSurface(WidgetTester tester) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Future<void> _selectLocation(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('register-state')));
  await tester.pumpAndSettle();
  await tester.tap(find.text('SP — São Paulo').last);
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('register-city')));
  await tester.pumpAndSettle();
  await tester.tap(find.text('São Paulo').last);
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  ApiClient apiWith(Future<http.Response> Function(http.Request) handler) {
    return ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/locations/states') &&
            !req.url.path.contains('/cities')) {
          return http.Response(
            jsonEncode([
              {'uf': 'SP', 'name': 'São Paulo'},
            ]),
            200,
            headers: _jsonHeaders,
          );
        }
        if (req.url.path.contains('/cities')) {
          return http.Response(
            jsonEncode([
              {'id': 1, 'name': 'São Paulo'},
            ]),
            200,
            headers: _jsonHeaders,
          );
        }
        return handler(req);
      }),
    );
  }

  test('callback OAuth distingue sessão e onboarding', () {
    expect(
      oauthOnboardingFromUri(
        Uri.parse('https://app-after.com.br/#/register?onboarding=abc'),
      ),
      'abc',
    );
    expect(
      oauthOnboardingFromUri(Uri.parse('after://auth/callback?onboarding=abc')),
      'abc',
    );
    expect(
      oauthTokenFromUri(
        Uri.parse('https://app-after.com.br/#/register?onboarding=abc'),
      ),
      isNull,
    );
    expect(
      oauthTokenFromUri(
        Uri.parse('https://app-after.com.br/#/oauth?token=jwt'),
      ),
      'jwt',
    );
  });

  testWidgets('1. Google novo abre cadastro', (tester) async {
    await _useTallSurface(tester);
    final token = _fakeOnboardingJwt();
    final api = apiWith((req) async {
      if (req.url.path.endsWith('/auth/google')) {
        return http.Response(
          jsonEncode({
            'needsRegistration': true,
            'onboardingToken': token,
            'profile': {
              'provider': 'google',
              'email': 'nova@gmail.com',
              'name': 'Nova Silva',
              'avatarUrl': 'https://example.com/avatar.png',
            },
          }),
          200,
          headers: _jsonHeaders,
        );
      }
      return http.Response('{}', 404);
    });
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false;
    await tester.pumpWidget(_app(api: api, auth: auth));
    await tester.pumpAndSettle();
    await auth.loginWithGoogle(idToken: 'google-id-token-value-ok');
    await tester.pumpAndSettle();
    expect(find.byType(RegisterScreen), findsOneWidget);
    expect(auth.user, isNull);
  });

  testWidgets('2. Apple novo abre cadastro', (tester) async {
    await _useTallSurface(tester);
    final token = _fakeOnboardingJwt(
      provider: 'apple',
      email: 'hidden@privaterelay.appleid.com',
      name: 'Ada Lovelace',
      avatarUrl: null,
    );
    final api = apiWith((req) async {
      if (req.url.path.endsWith('/auth/apple')) {
        return http.Response(
          jsonEncode({
            'needsRegistration': true,
            'onboardingToken': token,
            'profile': {
              'provider': 'apple',
              'email': 'hidden@privaterelay.appleid.com',
              'name': 'Ada Lovelace',
              'avatarUrl': null,
            },
          }),
          200,
          headers: _jsonHeaders,
        );
      }
      return http.Response('{}', 404);
    });
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false;
    await tester.pumpWidget(_app(api: api, auth: auth));
    await tester.pumpAndSettle();
    await auth.loginWithApple(
      identityToken: 'apple-identity-token-value-ok',
      fullName: 'Ada Lovelace',
    );
    await tester.pumpAndSettle();
    expect(find.byType(RegisterScreen), findsOneWidget);
    expect(auth.pendingSocialOnboarding?.email, 'hidden@privaterelay.appleid.com');
  });

  testWidgets('3-6. nome/e-mail/avatar preenchidos, senha vazia, tipo obrigatório',
      (tester) async {
    await _useTallSurface(tester);
    final api = apiWith((req) async => http.Response('{}', 404));
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false
      ..pendingSocialOnboarding = SocialOnboarding(
        onboardingToken: _fakeOnboardingJwt(),
        provider: 'google',
        email: 'nova@gmail.com',
        name: 'Nova Silva',
        avatarUrl: 'https://example.com/avatar.png',
      );
    await tester.pumpWidget(_app(api: api, auth: auth, initialRoute: AppRoutes.register));
    await tester.pumpAndSettle();

    expect(find.text('Nova Silva'), findsOneWidget);
    expect(find.text('nova@gmail.com'), findsOneWidget);
    expect(find.byKey(const Key('register-avatar')), findsOneWidget);
    expect(find.byKey(const Key('register-password')), findsNothing);
    expect(find.byKey(const Key('register-confirm-password')), findsNothing);

    final emailField = tester.widget<TextField>(find.byKey(const Key('register-email')));
    expect(emailField.readOnly, isTrue);
    expect(emailField.controller?.text, 'nova@gmail.com');
    expect(tester.widget<TextField>(find.byKey(const Key('register-name'))).controller?.text,
        'Nova Silva');

    await _selectLocation(tester);
    expect(tester.widget<ElevatedButton>(find.byKey(const Key('register-submit'))).onPressed,
        isNull);

    await tester.tap(find.byKey(const Key('register-role-user')));
    await tester.pump();
    expect(tester.widget<ElevatedButton>(find.byKey(const Key('register-submit'))).onPressed,
        isNotNull);
  });

  testWidgets('7. cadastro user social conclui', (tester) async {
    await _useTallSurface(tester);
    final token = _fakeOnboardingJwt();
    final api = apiWith((req) async {
      if (req.url.path.endsWith('/auth/social/complete-registration')) {
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        expect(body['onboardingToken'], token);
        expect(body['accountType'], 'user');
        expect(body.containsKey('email'), isFalse);
        expect(body.containsKey('password'), isFalse);
        expect(body.containsKey('providerId'), isFalse);
        return http.Response(jsonEncode(_sessionBody()), 201, headers: _jsonHeaders);
      }
      return http.Response('{}', 404);
    });
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false
      ..pendingSocialOnboarding = SocialOnboarding(
        onboardingToken: token,
        provider: 'google',
        email: 'nova@gmail.com',
        name: 'Nova Silva',
        avatarUrl: 'https://example.com/avatar.png',
      );
    await tester.pumpWidget(_app(api: api, auth: auth, initialRoute: AppRoutes.register));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('register-role-user')));
    await tester.pump();
    await _selectLocation(tester);
    await tester.tap(find.byKey(const Key('register-submit')));
    await tester.pumpAndSettle();
    expect(auth.user?.email, 'nova@gmail.com');
    expect(auth.user?.role, 'USER');
    expect(auth.pendingSocialOnboarding, isNull);
  });

  testWidgets('8. cadastro estabelecimento social conclui', (tester) async {
    await _useTallSurface(tester);
    final token = _fakeOnboardingJwt(provider: 'apple', name: 'Bar da Ada');
    final api = apiWith((req) async {
      if (req.url.path.endsWith('/auth/social/complete-registration')) {
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        expect(body['accountType'], 'venue');
        expect(body['name'], 'Bar da Ada');
        return http.Response(
          jsonEncode(_sessionBody(role: 'VENUE', venueId: 'v1')),
          201,
          headers: _jsonHeaders,
        );
      }
      return http.Response('{}', 404);
    });
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false
      ..pendingSocialOnboarding = SocialOnboarding(
        onboardingToken: token,
        provider: 'apple',
        email: 'hidden@privaterelay.appleid.com',
        name: 'Bar da Ada',
      );
    await tester.pumpWidget(_app(api: api, auth: auth, initialRoute: AppRoutes.register));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('register-role-venue')));
    await tester.pump();
    await _selectLocation(tester);
    await tester.tap(find.byKey(const Key('register-submit')));
    await tester.pumpAndSettle();
    expect(auth.user?.role, 'VENUE');
    expect(auth.user?.venueId, 'v1');
    expect(auth.pendingSocialOnboarding, isNull);
  });

  testWidgets('9. conta social existente pula cadastro', (tester) async {
    await _useTallSurface(tester);
    final api = apiWith((req) async {
      if (req.url.path.endsWith('/auth/google')) {
        return http.Response(jsonEncode(_sessionBody()), 200, headers: _jsonHeaders);
      }
      return http.Response('{}', 404);
    });
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false;
    await tester.pumpWidget(_app(api: api, auth: auth));
    await tester.pumpAndSettle();
    await auth.loginWithGoogle(idToken: 'google-id-token-value-ok');
    await tester.pumpAndSettle();
    expect(find.byType(RegisterScreen), findsNothing);
    expect(auth.user?.id, 'u1');
    expect(auth.pendingSocialOnboarding, isNull);
  });

  testWidgets('10. login e-mail/senha continua igual', (tester) async {
    await _useTallSurface(tester);
    final api = apiWith((req) async {
      if (req.url.path.endsWith('/auth/login')) {
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        expect(body['email'], 'ana@after.local');
        expect(body['password'], 'senha123');
        return http.Response(
          jsonEncode({
            'accessToken': 'session-jwt',
            'user': {
              'id': 'u1',
              'name': 'Ana',
              'email': 'ana@after.local',
              'role': 'USER',
              'state': 'SP',
              'city': 'São Paulo',
              'avatarUrl': null,
              'venueId': null,
            },
          }),
          200,
          headers: _jsonHeaders,
        );
      }
      return http.Response('{}', 404);
    });
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false;
    await tester.pumpWidget(_app(api: api, auth: auth));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('login-email')), 'ana@after.local');
    await tester.enterText(find.byKey(const Key('login-password')), 'senha123');
    await tester.tap(find.text('Entrar'));
    await tester.pumpAndSettle();
    expect(auth.user?.email, 'ana@after.local');
    expect(find.byType(RegisterScreen), findsNothing);
  });

  testWidgets('cadastro e-mail/senha ainda exige senha', (tester) async {
    await _useTallSurface(tester);
    final api = apiWith((req) async => http.Response('{}', 404));
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false;
    await tester.pumpWidget(_app(api: api, auth: auth, initialRoute: AppRoutes.register));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('register-password')), findsOneWidget);
    expect(tester.widget<TextField>(find.byKey(const Key('register-password'))).controller?.text,
        isEmpty);
  });
}
