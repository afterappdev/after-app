import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'core/auth/auth_storage.dart';
import 'core/auth/oauth_callback.dart';
import 'core/network/api_client.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/register_screen.dart';
import 'features/credits/credits_screen.dart';
import 'features/home/home_screen.dart';
import 'features/intro/app_startup.dart';
import 'features/notifications/notifications_controller.dart';
import 'features/notifications/notifications_screen.dart';
import 'features/profile/favorites_screen.dart';
import 'features/profile/user_profile_screen.dart';
import 'features/profile/venue_account_screen.dart';
import 'features/venue/venue_edit_screen.dart';
import 'features/venue/venue_public_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = ApiClient();
  final storage = AuthStorage();
  final auth = AuthController(api: api, storage: storage);
  final notifications = NotificationsController(api: api);
  await auth.bootstrap();
  await _consumePendingOAuthToken(auth);
  void syncInbox() {
    final user = auth.user;
    if (user != null && !user.isVenue) {
      notifications.start();
    } else {
      notifications.stop();
    }
  }

  syncInbox();
  auth.addListener(syncInbox);

  runApp(
    MultiProvider(
      providers: [
        Provider.value(value: api),
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider.value(value: notifications),
      ],
      child: AfterApp(auth: auth),
    ),
  );
}

Future<void> _consumePendingOAuthToken(AuthController auth) async {
  try {
    if (kIsWeb) {
      final token = oauthTokenFromUri(Uri.base);
      if (token != null) {
        await auth.loginWithAccessToken(token);
      }
      return;
    }
    final initial = await AppLinks().getInitialLink();
    if (initial == null) return;
    final token = oauthTokenFromUri(initial);
    if (token != null) {
      await auth.loginWithAccessToken(token);
    }
  } catch (_) {
    // Mantém o fluxo normal de login se o callback OAuth falhar.
  }
}

class AfterApp extends StatefulWidget {
  const AfterApp({super.key, required this.auth});

  final AuthController auth;

  @override
  State<AfterApp> createState() => _AfterAppState();
}

class _AfterAppState extends State<AfterApp> {
  @override
  void initState() {
    super.initState();
    if (!kIsWeb) {
      AppLinks().uriLinkStream.listen((uri) async {
        final token = oauthTokenFromUri(uri);
        if (token == null) return;
        try {
          await widget.auth.loginWithAccessToken(token);
        } catch (_) {}
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'After',
      theme: AppTheme.light,
      debugShowCheckedModeBanner: false,
      locale: const Locale('pt', 'BR'),
      supportedLocales: const [
        Locale('pt', 'BR'),
        Locale('pt'),
      ],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // Usa `home` em vez de `initialRoute: /login` para evitar
      // a rota implícita "/" que quebrava o web com tela branca.
      home: const AppStartup(),
      routes: {
        AppRoutes.login: (_) => const LoginScreen(),
        AppRoutes.register: (_) => const RegisterScreen(),
        AppRoutes.home: (_) => const HomeScreen(),
        AppRoutes.userProfile: (_) => const UserProfileScreen(),
        AppRoutes.venueAccount: (_) => const VenueAccountScreen(),
        AppRoutes.venueEdit: (_) => const VenueEditScreen(),
        AppRoutes.credits: (_) => const CreditsScreen(),
        AppRoutes.favorites: (_) => const FavoritesScreen(),
        AppRoutes.notifications: (_) => const NotificationsScreen(),
      },
      onGenerateRoute: (settings) {
        if (settings.name == AppRoutes.venuePublic) {
          final args = settings.arguments;
          late final String venueId;
          var navIndex = 0;
          if (args is String) {
            venueId = args;
          } else if (args is Map) {
            venueId = args['venueId']?.toString() ?? '';
            navIndex = args['navIndex'] as int? ?? 0;
          } else {
            return null;
          }
          if (venueId.isEmpty) return null;
          return MaterialPageRoute(
            builder: (_) => VenuePublicScreen(
              venueId: venueId,
              navIndex: navIndex,
            ),
            settings: settings,
          );
        }
        return null;
      },
    );
  }
}
