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
import 'package:after_app/features/auth/login_screen.dart';
import 'package:after_app/features/auth/models/user_session.dart';
import 'package:after_app/features/auth/password_reset_pages.dart';
import 'package:after_app/features/home/home_screen.dart';
import 'package:after_app/features/public/landing_page.dart';
import 'package:after_app/features/public/account_deletion_pages.dart';
import 'package:after_app/features/public/legal_pages.dart';
import 'package:after_app/features/public/privacy_policy_page.dart';
import 'package:after_app/features/public/web_root.dart';

const _artKeys = [
  Key('landing-art-header'),
  Key('landing-art-hero'),
  Key('landing-art-features'),
  Key('landing-art-business'),
  Key('landing-art-footer'),
];

Widget _publicSite({
  String initialRoute = '/',
  AuthController? auth,
  ApiClient? api,
}) {
  final client = api ?? ApiClient();
  final controller = auth ?? AuthController(api: client, storage: AuthStorage());
  controller.bootstrapping = false;
  return MultiProvider(
    providers: [
      Provider.value(value: client),
      ChangeNotifierProvider.value(value: controller),
    ],
    child: MaterialApp(
      initialRoute: initialRoute,
      routes: {
        AppRoutes.root: (_) => const LandingPage(),
        AppRoutes.login: (_) => const LoginScreenRoute(),
        AppRoutes.privacy: (_) => const PrivacyPolicyPage(),
        AppRoutes.accountDeletion: (_) => const AccountDeletionPage(),
        AppRoutes.confirmDeletion: (_) => const ConfirmAccountDeletionPage(),
        AppRoutes.forgotPassword: (_) => const ForgotPasswordPage(),
        AppRoutes.resetPassword: (_) => const ResetPasswordPage(),
        AppRoutes.contact: (_) => const ContactPage(),
      },
    ),
  );
}

Widget _webRoot({required AuthController auth, required ApiClient api}) {
  return MultiProvider(
    providers: [
      Provider.value(value: api),
      ChangeNotifierProvider.value(value: auth),
    ],
    child: const MaterialApp(home: WebRoot()),
  );
}

Future<void> _surface(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Finder _art(Key key) => find.byKey(key, skipOffstage: false);

Future<void> _expectStackedArt(WidgetTester tester, Size size) async {
  expect(tester.takeException(), isNull);
  expect(find.byType(LandingPage), findsOneWidget);

  final maxW = size.width < kLandingArtMaxWidth ? size.width : kLandingArtMaxWidth;

  for (final key in _artKeys) {
    expect(_art(key), findsOneWidget);
    final box = tester.renderObject<RenderBox>(_art(key));
    expect(box.size.width, closeTo(maxW, 0.6));
    expect(box.size.width, lessThanOrEqualTo(size.width + 0.6));
  }

  for (var i = 0; i < _artKeys.length - 1; i++) {
    final a = tester.getRect(_art(_artKeys[i]));
    final b = tester.getRect(_art(_artKeys[i + 1]));
    expect(b.top, closeTo(a.bottom, 0.6));
    expect(b.left, closeTo(a.left, 0.6));
    expect(b.width, closeTo(a.width, 0.6));
  }

  expect(
    tester.getSize(_art(const Key('landing-art-header'))).aspectRatio,
    closeTo(LandingArt.headerAspect, 0.02),
  );
  expect(
    tester.getSize(_art(const Key('landing-art-hero'))).aspectRatio,
    closeTo(LandingArt.heroAspect, 0.02),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('landing abre sem login', (tester) async {
    await _surface(tester, const Size(1200, 1600));
    await tester.pumpWidget(_publicSite());
    await tester.pumpAndSettle();

    expect(find.byType(LandingPage), findsOneWidget);
    expect(find.byType(LoginScreen), findsNothing);
    expect(find.byKey(const Key('public-header-entrar')), findsOneWidget);
    expect(find.byKey(const Key('landing-badge-play')), findsOneWidget);
    expect(find.byKey(const Key('landing-badge-store')), findsOneWidget);
    expect(_art(const Key('landing-art-header')), findsOneWidget);
    expect(_art(const Key('landing-art-hero')), findsOneWidget);
    expect(_art(const Key('landing-art-features')), findsOneWidget);
    expect(_art(const Key('landing-art-business')), findsOneWidget);
    expect(_art(const Key('landing-art-footer')), findsOneWidget);
  });

  testWidgets('botão Login/Cadastre-se leva ao login existente', (tester) async {
    await _surface(tester, const Size(1200, 900));
    await tester.pumpWidget(_publicSite());
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('public-header-entrar')));
    await tester.pumpAndSettle();

    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.text('Bem-vindo(a)!'), findsOneWidget);
  });

  testWidgets('badges das lojas não navegam (links ainda não publicados)',
      (tester) async {
    await _surface(tester, const Size(1200, 900));
    await tester.pumpWidget(_publicSite());
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('landing-badge-play')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('landing-badge-store')));
    await tester.pumpAndSettle();

    expect(find.byType(LoginScreen), findsNothing);
    expect(find.byType(LandingPage), findsOneWidget);
  });

  testWidgets('links de Política, Exclusão e Contato funcionam', (tester) async {
    await _surface(tester, const Size(1200, 1800));
    await tester.pumpWidget(_publicSite());
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('public-footer-privacy'), skipOffstage: false),
      400,
      scrollable: find.byType(Scrollable).first,
    );

    await tester.tap(find.byKey(const Key('public-footer-privacy')));
    await tester.pumpAndSettle();
    expect(find.text('Política de Privacidade'), findsWidgets);
    expect(find.textContaining('Última atualização'), findsOneWidget);

    await tester.tap(find.byKey(const Key('privacy-back')));
    await tester.pumpAndSettle();
    expect(find.byType(LandingPage), findsOneWidget);

    await tester.scrollUntilVisible(
      find.byKey(const Key('public-footer-deletion'), skipOffstage: false),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('public-footer-deletion')));
    await tester.pumpAndSettle();
    expect(find.byType(AccountDeletionPage), findsOneWidget);

    Navigator.of(tester.element(find.byType(AccountDeletionPage))).pop();
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('public-footer-contact'), skipOffstage: false),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('public-footer-contact')));
    await tester.pumpAndSettle();
    expect(find.byType(ContactPage), findsOneWidget);
  });

  testWidgets('política abre sem login', (tester) async {
    await tester.pumpWidget(
      _publicSite(initialRoute: AppRoutes.privacy),
    );
    await tester.pumpAndSettle();

    expect(find.text('Política de Privacidade'), findsWidgets);
    expect(find.textContaining('Última atualização'), findsOneWidget);
    expect(find.text('Nesta página'), findsOneWidget);
    expect(find.text('1. Quem somos'), findsOneWidget);
    expect(find.byKey(const Key('privacy-back')), findsOneWidget);
    expect(find.byType(LoginScreen), findsNothing);
  });

  testWidgets('voltar ao site sai da política', (tester) async {
    await tester.pumpWidget(
      _publicSite(initialRoute: AppRoutes.privacy),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('privacy-back')));
    await tester.pumpAndSettle();

    expect(find.byType(LandingPage), findsOneWidget);
    expect(find.byKey(const Key('landing-art-header')), findsOneWidget);
  });

  testWidgets('usuário autenticado não vê a landing no WebRoot', (tester) async {
    final api = ApiClient(
      client: MockClient((_) async => http.Response('[]', 200)),
    );
    final auth = AuthController(api: api, storage: AuthStorage())
      ..bootstrapping = false
      ..user = UserSession(
        id: 'u1',
        name: 'Ana',
        email: 'ana@after.local',
        role: 'USER',
        state: 'SP',
        city: 'São Paulo',
      );

    await tester.pumpWidget(_webRoot(auth: auth, api: api));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byType(LandingPage), findsNothing);
    expect(find.byType(HomeScreen), findsOneWidget);
  });

  testWidgets('rotas internas nomeadas continuam registradas', (tester) async {
    expect(AppRoutes.login, '/login');
    expect(AppRoutes.home, '/home');
    expect(AppRoutes.register, '/register');
    expect(AppRoutes.privacy, '/politica-de-privacidade');
    expect(AppRoutes.accountDeletion, '/exclusao-de-conta');
    expect(AppRoutes.confirmDeletion, '/confirmar-exclusao');
    expect(AppRoutes.forgotPassword, '/esqueci-minha-senha');
    expect(AppRoutes.resetPassword, '/redefinir-senha');
    expect(AppRoutes.contact, '/contato');
  });

  testWidgets('layout 390x844 da landing não estoura', (tester) async {
    await _surface(tester, const Size(390, 844));
    await tester.pumpWidget(_publicSite());
    await tester.pumpAndSettle();
    await _expectStackedArt(tester, const Size(390, 844));
    expect(find.byKey(const Key('public-header-entrar')), findsOneWidget);
  });

  testWidgets('layout 360x800 da landing não estoura', (tester) async {
    await _surface(tester, const Size(360, 800));
    await tester.pumpWidget(_publicSite());
    await tester.pumpAndSettle();
    await _expectStackedArt(tester, const Size(360, 800));
  });

  testWidgets('layout 768x1024 da landing não estoura', (tester) async {
    await _surface(tester, const Size(768, 1024));
    await tester.pumpWidget(_publicSite());
    await tester.pumpAndSettle();
    await _expectStackedArt(tester, const Size(768, 1024));
  });

  testWidgets('layout 1440x900 da landing não estoura', (tester) async {
    await _surface(tester, const Size(1440, 900));
    await tester.pumpWidget(_publicSite());
    await tester.pumpAndSettle();
    await _expectStackedArt(tester, const Size(1440, 900));
    expect(find.byKey(const Key('public-header-entrar')), findsOneWidget);
  });

  testWidgets('layout 1920x1080 da landing não estoura', (tester) async {
    await _surface(tester, const Size(1920, 1080));
    await tester.pumpWidget(_publicSite());
    await tester.pumpAndSettle();
    await _expectStackedArt(tester, const Size(1920, 1080));
  });
}
