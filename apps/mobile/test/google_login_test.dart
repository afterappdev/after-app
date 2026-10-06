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
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/login_screen.dart';
import 'package:after_app/features/auth/social_auth.dart';

const _jsonHeaders = {'content-type': 'application/json'};

Map<String, dynamic> _sessionBody({String role = 'USER', String? venueId}) => {
      'accessToken': 'session-jwt',
      'user': {
        'id': 'u-existing',
        'name': 'Ana',
        'email': 'ana@after.local',
        'role': role,
        'state': 'SP',
        'city': 'São Paulo',
        'avatarUrl': null,
        'venueId': venueId,
      },
    };

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('logo Google ocupa um quadrado e o traço original é proporcional', () {
    final bounds = debugGoogleLogoBounds();
    expect(bounds.width, greaterThan(40));
    expect(bounds.height, greaterThan(40));
    expect(bounds.width / bounds.height, inInclusiveRange(0.9, 1.1));
  });

  testWidgets('botão Google mantém o logo quadrado', (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = ApiClient(client: MockClient((_) async => http.Response('{}', 404)));
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false;
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider.value(value: api),
          ChangeNotifierProvider.value(value: auth),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pumpAndSettle();
    final size = tester.getSize(find.byKey(const Key('google-logo')));
    expect(size.width, 20);
    expect(size.height, 20);
  });

  test('callback nativo com erro volta mensagem ao app, sem JSON cru', () {
    final uri = Uri.parse(
      'after://auth/callback?error=${Uri.encodeComponent('Esta conta já está vinculada a outro Google. Entre com e-mail e senha.')}',
    );
    expect(oauthErrorFromUri(uri), contains('outro Google'));
    expect(oauthErrorFromUri(uri), isNot(contains('statusCode')));
    expect(oauthTokenFromUri(uri), isNull);
    expect(
      oauthErrorFromUri(
        Uri.parse(
          'after://auth/callback?error=${Uri.encodeComponent('{"message":"x","statusCode":409}')}',
        ),
      ),
      'Não foi possível concluir o login com Google.',
    );
  });

  test('Google nativo de conta existente chama /auth/google e não abre o navegador', () async {
    final posted = <String>[];
    Uri? launched;
    final api = ApiClient(
      client: MockClient((req) async {
        posted.add(req.url.path);
        if (req.url.path.endsWith('/auth/google')) {
          return http.Response(jsonEncode(_sessionBody()), 200, headers: _jsonHeaders);
        }
        return http.Response('{}', 404);
      }),
    );
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false;
    final social = SocialAuth(
      api: api,
      auth: auth,
      isWeb: false,
      nativeGoogleIdToken: () async => 'google-id-token-value-ok',
      launchUrlFn: (uri, {LaunchMode mode = LaunchMode.platformDefault, String? webOnlyWindowName}) async {
        launched = uri;
        return true;
      },
    );

    await social.signInWithGoogle();

    expect(posted, ['/auth/google']);
    expect(launched, isNull);
    expect(auth.user?.id, 'u-existing');
    expect(auth.pendingSocialOnboarding, isNull);
  });

  test('Google novo segue onboarding sem abrir o navegador', () async {
    Uri? launched;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/auth/google')) {
          return http.Response(
            jsonEncode({
              'needsRegistration': true,
              'onboardingToken': 'header.payload.sig',
              'profile': {
                'provider': 'google',
                'email': 'nova@gmail.com',
                'name': 'Nova',
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
    final social = SocialAuth(
      api: api,
      auth: auth,
      isWeb: false,
      nativeGoogleIdToken: () async => 'google-id-token-value-ok',
      launchUrlFn: (uri, {LaunchMode mode = LaunchMode.platformDefault, String? webOnlyWindowName}) async {
        launched = uri;
        return true;
      },
    );

    await social.signInWithGoogle();

    expect(launched, isNull);
    expect(auth.user, isNull);
    expect(auth.pendingSocialOnboarding?.email, 'nova@gmail.com');
    expect(auth.pendingSocialOnboarding?.provider, 'google');
  });

  test('erro da API no login Google fica no app e não cai no navegador', () async {
    Uri? launched;
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/auth/google')) {
          return http.Response(
            jsonEncode({
              'message': 'Esta conta já está vinculada a outro Google. Entre com e-mail e senha.',
              'error': 'Conflict',
              'statusCode': 409,
            }),
            409,
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
      isWeb: false,
      nativeGoogleIdToken: () async => 'google-id-token-value-ok',
      launchUrlFn: (uri, {LaunchMode mode = LaunchMode.platformDefault, String? webOnlyWindowName}) async {
        launched = uri;
        return true;
      },
    );

    await expectLater(
      social.signInWithGoogle(),
      throwsA(
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          'Esta conta já está vinculada a outro Google. Entre com e-mail e senha.',
        ),
      ),
    );
    expect(launched, isNull);
    expect(auth.user, isNull);
  });

  testWidgets('botão Google entra com a conta existente', (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path.endsWith('/auth/google')) {
          return http.Response(
            jsonEncode(_sessionBody(role: 'VENUE', venueId: 'venue-1')),
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
          home: LoginScreen(
            socialAuthFactory: (api, auth) => SocialAuth(
              api: api,
              auth: auth,
              isWeb: false,
              nativeGoogleIdToken: () async => 'google-id-token-value-ok',
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Google'));
    await tester.pumpAndSettle();
    expect(auth.user?.id, 'u-existing');
    expect(auth.user?.role, 'VENUE');
    expect(auth.user?.venueId, 'venue-1');
  });

  testWidgets('erro OAuth do deep link aparece no login', (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = ApiClient(client: MockClient((_) async => http.Response('{}', 404)));
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false;
    auth.presentOAuthError(
      'Esta conta já está vinculada a outro Google. Entre com e-mail e senha.',
    );
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider.value(value: api),
          ChangeNotifierProvider.value(value: auth),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('outro Google'), findsOneWidget);
    expect(find.textContaining('statusCode'), findsNothing);
    expect(find.textContaining('{'), findsNothing);
  });
}
