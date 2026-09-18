import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/auth/oauth_callback.dart';
import 'package:after_app/core/config/api_config.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/core/router/app_router.dart';
import 'package:after_app/features/auth/apple_web_callback_page.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/models/social_onboarding.dart';
import 'package:after_app/features/auth/social_auth.dart';

const _jsonHeaders = {'content-type': 'application/json'};

String _fakeOnboardingJwt() {
  String encode(Map<String, dynamic> json) =>
      base64Url.encode(utf8.encode(jsonEncode(json))).replaceAll('=', '');
  return '${encode({'alg': 'none', 'typ': 'JWT'})}.'
      '${encode({
        'typ': 'social_onboarding',
        'provider': 'apple',
        'providerId': 'aid-new',
        'email': 'hidden@privaterelay.appleid.com',
        'name': 'Ada Lovelace',
      })}.sig';
}

Map<String, dynamic> _sessionBody() => {
      'accessToken': 'session-jwt',
      'user': {
        'id': 'u1',
        'name': 'Ada Lovelace',
        'email': 'hidden@privaterelay.appleid.com',
        'role': 'USER',
        'state': 'SP',
        'city': 'São Paulo',
        'avatarUrl': null,
        'venueId': null,
      },
    };

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('callback Apple Web lê só o código temporário e não o JWT', () {
    final uri = Uri.parse(
      'https://app-after.com.br/#/auth/apple/callback?code=temp-code-1',
    );
    expect(appleExchangeCodeFromUri(uri), 'temp-code-1');
    expect(oauthTokenFromUri(uri), isNull);
    expect(isAppleWebCallbackUri(uri), isTrue);
    expect(
      appleWebStartUri(
        apiBase: ApiConfig.baseUrl,
        redirect: 'https://app-after.com.br/',
      ).path,
      '/auth/apple/start',
    );
  });

  test('Google e onboarding helpers continuam iguais', () {
    expect(
      oauthTokenFromUri(
        Uri.parse('https://app-after.com.br/#/oauth?token=jwt'),
      ),
      'jwt',
    );
    expect(
      oauthOnboardingFromUri(
        Uri.parse('https://app-after.com.br/#/register?onboarding=abc'),
      ),
      'abc',
    );
  });

  test('botão Apple Web inicia /auth/apple/start', () async {
    Uri? launched;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/auth/providers')) {
          return http.Response(
            jsonEncode({
              'google': true,
              'googleBrowser': true,
              'apple': true,
              'appleBrowser': true,
            }),
            200,
            headers: _jsonHeaders,
          );
        }
        return http.Response('{}', 404);
      }),
    );
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false;
    final social = SocialAuth(
      api: api,
      auth: auth,
      isWeb: true,
      pageUri: Uri.parse('https://app-after.com.br/'),
      launchUrlFn: (
        uri, {
        LaunchMode mode = LaunchMode.platformDefault,
        String? webOnlyWindowName,
      }) async {
        launched = uri;
        return true;
      },
    );
    await social.signInWithApple();
    expect(launched, isNotNull);
    expect(launched!.path, '/auth/apple/start');
    expect(launched!.queryParameters['redirect'], isNotEmpty);
  });

  test('iOS continua no fluxo nativo e não abre o browser', () async {
    var nativeCalled = false;
    Uri? launched;
    final posted = <String>[];
    final nativeApi = ApiClient(
      client: MockClient((req) async {
        posted.add(req.url.path);
        if (req.url.path.endsWith('/auth/apple')) {
          return http.Response(
            jsonEncode(_sessionBody()),
            200,
            headers: _jsonHeaders,
          );
        }
        return http.Response('{}', 404);
      }),
    );
    final nativeAuth = AuthController(api: nativeApi, storage: AuthStorage())
      ..bootstrapping = false;
    final nativeSocial = SocialAuth(
      api: nativeApi,
      auth: nativeAuth,
      isWeb: false,
      nativeAppleSignIn: (controller) async {
        nativeCalled = true;
        await controller.loginWithApple(
          identityToken: 'native-identity-token-value-ok',
        );
      },
      launchUrlFn: (
        uri, {
        LaunchMode mode = LaunchMode.platformDefault,
        String? webOnlyWindowName,
      }) async {
        launched = uri;
        return true;
      },
    );
    await nativeSocial.signInWithApple();
    expect(nativeCalled, isTrue);
    expect(launched, isNull);
    expect(posted.single, '/auth/apple');
    expect(nativeAuth.user?.id, 'u1');
  });

  test('Google não foi alterado', () async {
    final posted = <String>[];
    final api = ApiClient(
      client: MockClient((req) async {
        posted.add(req.url.path);
        if (req.url.path.endsWith('/auth/google')) {
          return http.Response(
            jsonEncode(_sessionBody()),
            200,
            headers: _jsonHeaders,
          );
        }
        return http.Response('{}', 404);
      }),
    );
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false;
    await auth.loginWithGoogle(idToken: 'google-id-token-value-ok');
    expect(posted.single, '/auth/google');
    expect(auth.user?.id, 'u1');
  });

  test('troca código temporário por sessão', () async {
    final posted = <http.Request>[];
    final api = ApiClient(
      client: MockClient((req) async {
        posted.add(req);
        if (req.url.path.endsWith('/auth/apple/web/exchange')) {
          return http.Response(
            jsonEncode(_sessionBody()),
            200,
            headers: _jsonHeaders,
          );
        }
        return http.Response('{}', 404);
      }),
    );
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false;
    await auth.exchangeAppleWebLogin('temp-code-1');
    expect(posted.single.url.path, '/auth/apple/web/exchange');
    expect(jsonDecode(posted.single.body)['code'], 'temp-code-1');
    expect(auth.user?.id, 'u1');
  });

  testWidgets('callback troca código e segue onboarding social', (tester) async {
    final token = _fakeOnboardingJwt();
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/auth/apple/web/exchange')) {
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
      }),
    );
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false;
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider.value(value: api),
          ChangeNotifierProvider.value(value: auth),
        ],
        child: MaterialApp(
          routes: {
            AppRoutes.home: (_) => const Scaffold(body: Text('HOME')),
            AppRoutes.register: (_) => const Scaffold(body: Text('REGISTER')),
            AppRoutes.login: (_) => const Scaffold(body: Text('LOGIN')),
          },
          onGenerateRoute: (settings) {
            if (loginPath(settings.name) == AppRoutes.login) {
              return MaterialPageRoute(
                builder: (_) => const Scaffold(body: Text('LOGIN')),
                settings: settings,
              );
            }
            return null;
          },
          home: const AppleWebCallbackPage(code: 'temp-code-1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    await tester.pumpAndSettle();
    expect(find.text('REGISTER'), findsOneWidget);
    expect(auth.pendingSocialOnboarding, isA<SocialOnboarding>());
    expect(auth.user, isNull);
  });

  testWidgets('erro e cancelamento voltam ao login', (tester) async {
    final api = ApiClient(
      client: MockClient((req) async => http.Response('{}', 404)),
    );
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false;

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider.value(value: api),
          ChangeNotifierProvider.value(value: auth),
        ],
        child: MaterialApp(
          routes: {
            AppRoutes.login: (_) => const Scaffold(body: Text('LOGIN')),
          },
          onGenerateRoute: (settings) {
            if (loginPath(settings.name) == AppRoutes.login) {
              return MaterialPageRoute(
                builder: (_) => Scaffold(
                  body: Text(
                    'LOGIN ${appleWebStatusFromRouteName(settings.name)}',
                  ),
                ),
                settings: settings,
              );
            }
            return null;
          },
          home: const AppleWebCallbackPage(status: 'canceled'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    await tester.pumpAndSettle();
    expect(find.text('LOGIN canceled'), findsOneWidget);
  });
}
