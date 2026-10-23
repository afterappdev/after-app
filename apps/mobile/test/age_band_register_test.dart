import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:after_app/core/auth/auth_storage.dart';
import 'package:after_app/core/network/api_client.dart';
import 'package:after_app/core/router/app_router.dart';
import 'package:after_app/features/auth/auth_controller.dart';
import 'package:after_app/features/auth/models/social_onboarding.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/auth/register_screen.dart';
import 'package:after_app/features/notifications/notifications_controller.dart';
import 'package:after_app/features/profile/age_band.dart';
import 'package:after_app/features/profile/user_profile_screen.dart';

const _jsonHeaders = {'content-type': 'application/json'};

const _bands = [
  ('AGE_0_18', 'De 0 a 18 anos'),
  ('AGE_19_35', 'De 19 a 35 anos'),
  ('AGE_36_50', 'De 36 a 50 anos'),
  ('AGE_OVER_50', 'Mais de 50 anos'),
];

String _fakeOnboardingJwt({String provider = 'apple'}) {
  String encode(Map<String, dynamic> json) =>
      base64Url.encode(utf8.encode(jsonEncode(json))).replaceAll('=', '');
  return '${encode({'alg': 'none', 'typ': 'JWT'})}.'
      '${encode({
        'typ': 'social_onboarding',
        'provider': provider,
        'providerId': 'aid-new',
        'email': 'nova@privaterelay.appleid.com',
        'name': 'Nova Silva',
      })}.sig';
}

Widget _registerApp(ApiClient api, AuthController auth) {
  return MultiProvider(
    providers: [
      Provider.value(value: api),
      ChangeNotifierProvider.value(value: auth),
    ],
    child: MaterialApp(
      initialRoute: AppRoutes.register,
      routes: {
        AppRoutes.register: (_) => const RegisterScreen(),
        AppRoutes.home: (_) => const Scaffold(body: Text('HOME')),
      },
    ),
  );
}

ApiClient _api(Future<http.Response> Function(http.Request) handler) {
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
      if (req.url.path.contains('/cities') ||
          req.url.path.endsWith('/locations/cities')) {
        return http.Response(
          jsonEncode([
            {'id': 1, 'name': 'São Paulo', 'uf': 'SP'},
          ]),
          200,
          headers: _jsonHeaders,
        );
      }
      if (req.url.path.endsWith('/notifications/unread-count')) {
        return http.Response(jsonEncode({'count': 0}), 200, headers: _jsonHeaders);
      }
      return handler(req);
    }),
  );
}

Future<void> _selectLocation(WidgetTester tester) async {
  await tester.enterText(find.byKey(const Key('register-city')), 'São Paulo');
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pumpAndSettle();
  final suggestion = find.text('São Paulo, SP');
  await tester.ensureVisible(suggestion);
  await tester.tap(suggestion);
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('as quatro faixas aparecem sem pré-seleção e cabem na tela estreita',
      (tester) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = _api((_) async => http.Response('{}', 404));
    final auth = AuthController(api: api, storage: AuthStorage())..bootstrapping = false;
    await tester.pumpWidget(_registerApp(api, auth));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('register-age-question')), findsOneWidget);
    expect(find.text('Qual é a sua faixa etária?'), findsOneWidget);
    for (final band in _bands) {
      final option = find.byKey(Key('register-age-${band.$1}'));
      await tester.ensureVisible(option);
      expect(option, findsOneWidget);
      final label = tester.widget<Text>(find.descendant(
        of: option,
        matching: find.text(band.$2),
      ));
      expect(label.style?.color, const Color(0xFF282829));
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('sem seleção o cadastro avisa e não chama a API', (tester) async {
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    var posts = 0;
    final api = _api((req) async {
      if (req.method == 'POST') posts += 1;
      return http.Response('{}', 404);
    });
    final auth = AuthController(api: api, storage: AuthStorage())..bootstrapping = false;
    await tester.pumpWidget(_registerApp(api, auth));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('register-email')), 'ana@after.local');
    await tester.enterText(find.byKey(const Key('register-name')), 'Ana');
    await tester.enterText(find.byKey(const Key('register-password')), 'senha123');
    await tester.enterText(find.byKey(const Key('register-confirm-password')), 'senha123');
    await _selectLocation(tester);
    await tester.ensureVisible(find.byKey(const Key('register-submit')));
    await tester.tap(find.byKey(const Key('register-submit')));
    await tester.pump();
    expect(find.text(kAgeBandRequiredMessage), findsOneWidget);
    expect(posts, 0);
  });

  testWidgets('cadastro tradicional envia só a faixa escolhida', (tester) async {
    tester.view.physicalSize = const Size(390, 2200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    Map<String, dynamic>? body;
    final api = _api((req) async {
      if (req.url.path.endsWith('/auth/register')) {
        body = jsonDecode(req.body) as Map<String, dynamic>;
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
            },
          }),
          201,
          headers: _jsonHeaders,
        );
      }
      return http.Response('{}', 404);
    });
    final auth = AuthController(api: api, storage: AuthStorage())..bootstrapping = false;
    await tester.pumpWidget(_registerApp(api, auth));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('register-email')), 'ana@after.local');
    await tester.enterText(find.byKey(const Key('register-name')), 'Ana');
    await tester.enterText(find.byKey(const Key('register-password')), 'senha123');
    await tester.enterText(find.byKey(const Key('register-confirm-password')), 'senha123');
    await tester.ensureVisible(find.byKey(const Key('register-age-AGE_OVER_50')));
    await tester.tap(find.byKey(const Key('register-age-AGE_OVER_50')));
    await tester.pump();
    final selected = tester.widget<Text>(find.descendant(
      of: find.byKey(const Key('register-age-AGE_OVER_50')),
      matching: find.text('Mais de 50 anos'),
    ));
    expect(selected.style?.color, Colors.white);
    await _selectLocation(tester);
    await tester.ensureVisible(find.byKey(const Key('register-submit')));
    await tester.tap(find.byKey(const Key('register-submit')));
    await tester.pumpAndSettle();
    expect(body?['ageBand'], 'AGE_OVER_50');
    expect(body?.containsKey('birthDate'), isFalse);
    expect(body?.containsKey('documentNumber'), isFalse);
    expect(auth.user?.role, 'USER');
  });

  testWidgets('estabelecimento não vê a faixa etária', (tester) async {
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = _api((_) async => http.Response('{}', 404));
    final auth = AuthController(api: api, storage: AuthStorage())..bootstrapping = false;
    await tester.pumpWidget(_registerApp(api, auth));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('register-role-venue')));
    await tester.pump();
    expect(find.byKey(const Key('register-age-question')), findsNothing);
    expect(find.byKey(const Key('register-document')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('cadastro Apple envia a faixa antes de concluir', (tester) async {
    tester.view.physicalSize = const Size(390, 2200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final token = _fakeOnboardingJwt();
    Map<String, dynamic>? body;
    final api = _api((req) async {
      if (req.url.path.endsWith('/auth/social/complete-registration')) {
        body = jsonDecode(req.body) as Map<String, dynamic>;
        return http.Response(
          jsonEncode({
            'accessToken': 'session-jwt',
            'user': {
              'id': 'u1',
              'name': 'Nova Silva',
              'email': 'nova@privaterelay.appleid.com',
              'role': 'USER',
              'state': 'SP',
              'city': 'São Paulo',
              'avatarUrl': null,
            },
          }),
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
        email: 'nova@privaterelay.appleid.com',
        name: 'Nova Silva',
      );
    await tester.pumpWidget(_registerApp(api, auth));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('register-age-question')), findsNothing);
    await tester.tap(find.byKey(const Key('register-role-user')));
    await tester.pump();
    expect(find.byKey(const Key('register-age-question')), findsOneWidget);
    await tester.tap(find.byKey(const Key('register-age-AGE_0_18')));
    await _selectLocation(tester);
    await tester.ensureVisible(find.byKey(const Key('register-submit')));
    await tester.tap(find.byKey(const Key('register-submit')));
    await tester.pumpAndSettle();
    expect(body?['accountType'], 'user');
    expect(body?['ageBand'], 'AGE_0_18');
    expect(body?.containsKey('password'), isFalse);
  });

  testWidgets('perfil antigo preenche a faixa depois e o login não depende dela',
      (tester) async {
    tester.view.physicalSize = const Size(390, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    Map<String, dynamic>? patch;
    final api = _api((req) async {
      if (req.url.path.endsWith('/users/me') && req.method == 'GET') {
        return http.Response(
          jsonEncode({
            'id': 'u-old',
            'name': 'Ana',
            'email': 'ana@after.local',
            'role': 'USER',
            'state': 'SP',
            'city': 'São Paulo',
            'avatarUrl': null,
            'ageBand': null,
          }),
          200,
          headers: _jsonHeaders,
        );
      }
      if (req.url.path.endsWith('/users/me') && req.method == 'PATCH') {
        patch = jsonDecode(req.body) as Map<String, dynamic>;
        return http.Response(
          jsonEncode({
            'id': 'u-old',
            'name': 'Ana',
            'email': 'ana@after.local',
            'role': 'USER',
            'state': 'SP',
            'city': 'São Paulo',
            'avatarUrl': null,
            'ageBand': patch?['ageBand'],
          }),
          200,
          headers: _jsonHeaders,
        );
      }
      return http.Response('{}', 404);
    });
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false
      ..user = UserSession(
        id: 'u-old',
        name: 'Ana',
        email: 'ana@after.local',
        role: 'USER',
        state: 'SP',
        city: 'São Paulo',
      );
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider.value(value: api),
          ChangeNotifierProvider.value(value: auth),
          ChangeNotifierProvider(
            create: (_) => NotificationsController(api: api),
          ),
        ],
        child: const MaterialApp(home: UserProfileScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Selecione'), findsWidgets);
    await tester.ensureVisible(find.byKey(const Key('profile-age-band')));
    await tester.tap(find.byKey(const Key('profile-age-band')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('profile-age-AGE_19_35')));
    await tester.pumpAndSettle();
    expect(find.text('De 19 a 35 anos'), findsOneWidget);
    await tester.ensureVisible(find.text('Salvar alterações'));
    await tester.tap(find.text('Salvar alterações'));
    await tester.pumpAndSettle();
    expect(patch?['ageBand'], 'AGE_19_35');
    expect(patch?.containsKey('birthDate'), isFalse);
    expect(tester.takeException(), isNull);
  });
}
