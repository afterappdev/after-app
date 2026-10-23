import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'core/auth/auth_storage.dart';
import 'core/auth/oauth_callback.dart';
import 'core/location/device_locator.dart';
import 'core/location/origin_cache.dart';
import 'core/network/api_client.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/apple_web_callback_page.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/password_reset_pages.dart';
import 'features/auth/password_reset_uri.dart';
import 'features/auth/register_screen.dart';
import 'features/credits/credits_screen.dart';
import 'features/home/home_screen.dart';
import 'features/intro/app_startup.dart';
import 'features/notifications/notifications_controller.dart';
import 'features/notifications/notifications_screen.dart';
import 'features/promo_push/municipality_geocoder.dart';
import 'features/promo_push/promo_push_api.dart';
import 'features/promo_push/promo_push_coordinator.dart';
import 'features/promo_push/promo_push_message.dart';
import 'features/promo_push/promo_push_messaging_factory.dart';
import 'features/promo_push/promo_push_router.dart';
import 'features/profile/blocked_venues_screen.dart';
import 'features/profile/favorites_screen.dart';
import 'features/profile/user_profile_screen.dart';
import 'features/profile/venue_account_screen.dart';
import 'features/public/account_deletion_pages.dart';
import 'features/public/account_deletion_uri.dart';
import 'features/public/legal_pages.dart';
import 'features/public/privacy_policy_page.dart';
import 'features/public/terms_of_use_page.dart';
import 'features/public/web_root.dart';
import 'features/venue/venue_edit_screen.dart';
import 'features/venue/venue_public_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = ApiClient();
  final storage = AuthStorage();
  final auth = AuthController(api: api, storage: storage);
  final ledger = PromoDeliveryLedger();
  final notifications = NotificationsController(
    api: api,
    deliveryLedger: ledger,
  );
  final navigatorKey = GlobalKey<NavigatorState>();
  final promoApi = PromoPushApi(api);
  final androidPromo =
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
  final promo = PromoPushCoordinator(
    api: promoApi,
    messaging: createPromoPushMessaging(),
    ledger: ledger,
    router: PromoPushRouter(navigatorKey: navigatorKey, api: promoApi),
    cityMemory: PreferencesPromoCityMemory(),
    geocoder: androidPromo ? NominatimMunicipalityGeocoder() : null,
    locator: androidPromo ? const GeolocatorDeviceLocator() : null,
    onSessionEnd: () => OriginCache().clear(),
  );
  await auth.bootstrap();
  await promo.start(auth);
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
        ChangeNotifierProvider.value(value: promo),
      ],
      child: AfterApp(auth: auth, navigatorKey: navigatorKey, promo: promo),
    ),
  );
}

Future<void> _consumePendingOAuthToken(AuthController auth) async {
  try {
    if (kIsWeb) {
      if (isAccountDeletionConfirmUri(Uri.base) ||
          isPasswordResetUri(Uri.base) ||
          isAppleWebCallbackUri(Uri.base)) {
        return;
      }
      final onboarding = oauthOnboardingFromUri(Uri.base);
      if (onboarding != null) {
        auth.beginSocialOnboardingFromToken(onboarding);
        return;
      }
      final token = oauthTokenFromUri(Uri.base);
      if (token != null) {
        await auth.loginWithAccessToken(token);
      }
      return;
    }
    final initial = await AppLinks().getInitialLink();
    if (initial == null) return;
    await _consumeOAuthUri(auth, initial);
  } catch (_) {
    // Mantém o fluxo normal de login se o callback OAuth falhar.
  }
}

Future<void> _consumeOAuthUri(AuthController auth, Uri uri) async {
  final oauthError = oauthErrorFromUri(uri);
  if (oauthError != null) {
    auth.presentOAuthError(oauthError);
    return;
  }
  final onboarding = oauthOnboardingFromUri(uri);
  if (onboarding != null) {
    auth.beginSocialOnboardingFromToken(onboarding);
    return;
  }
  final token = oauthTokenFromUri(uri);
  if (token != null) {
    await auth.loginWithAccessToken(token);
  }
}

class AfterApp extends StatefulWidget {
  const AfterApp({
    super.key,
    required this.auth,
    this.navigatorKey,
    this.promo,
  });

  final AuthController auth;
  final GlobalKey<NavigatorState>? navigatorKey;
  final PromoPushCoordinator? promo;

  @override
  State<AfterApp> createState() => _AfterAppState();
}

class _AfterAppState extends State<AfterApp> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.promo?.consumeLaunchMessage();
    });
    if (!kIsWeb) {
      AppLinks().uriLinkStream.listen((uri) async {
        try {
          await _consumeOAuthUri(widget.auth, uri);
        } catch (_) {}
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: widget.navigatorKey,
      title: 'After | O que tem pra hoje?',
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
      // `/` definido em `routes` (não usar `initialRoute: /login` sem `/`,
      // isso gerava tela branca no web). Web: landing. Nativo: intro.
      routes: {
        AppRoutes.root: (_) =>
            kIsWeb ? const WebRoot() : const AppStartup(),
        AppRoutes.login: (_) => const LoginScreenRoute(),
        AppRoutes.register: (_) =>
            RegisterScreen(showPublicHomeLink: kIsWeb),
        AppRoutes.home: (_) => const HomeScreen(),
        AppRoutes.userProfile: (_) => const UserProfileScreen(),
        AppRoutes.venueAccount: (_) => const VenueAccountScreen(),
        AppRoutes.venueEdit: (_) => const VenueEditScreen(),
        AppRoutes.credits: (_) => const CreditsScreen(),
        AppRoutes.favorites: (_) => const FavoritesScreen(),
        AppRoutes.blockedVenues: (_) => const BlockedVenuesScreen(),
        AppRoutes.notifications: (_) => const NotificationsScreen(),
        AppRoutes.privacy: (_) => const PrivacyPolicyPage(),
        AppRoutes.terms: (_) => const TermsOfUsePage(),
        AppRoutes.accountDeletion: (_) => const AccountDeletionPage(),
        AppRoutes.confirmDeletion: (_) => const ConfirmAccountDeletionPage(),
        AppRoutes.forgotPassword: (_) => const ForgotPasswordPage(),
        AppRoutes.resetPassword: (_) => const ResetPasswordPage(),
        AppRoutes.contact: (_) => const ContactPage(),
      },
      onGenerateRoute: (settings) {
        final applePath = appleWebCallbackPath(settings.name);
        if (applePath == AppRoutes.appleWebCallback) {
          return MaterialPageRoute(
            builder: (_) => AppleWebCallbackPage(
              code: appleExchangeCodeFromRouteName(settings.name),
              status: appleWebStatusFromRouteName(settings.name),
            ),
            settings: settings,
          );
        }
        if (loginPath(settings.name) == AppRoutes.login) {
          return MaterialPageRoute(
            builder: (_) => LoginScreenRoute(
              appleWebStatus: appleWebStatusFromRouteName(settings.name),
              oauthError: oauthErrorFromRouteName(settings.name),
            ),
            settings: settings,
          );
        }
        final confirmPath = deletionConfirmPath(settings.name);
        if (confirmPath == AppRoutes.confirmDeletion) {
          return MaterialPageRoute(
            builder: (_) => ConfirmAccountDeletionPage(
              token: deletionConfirmTokenFromRouteName(settings.name) ?? '',
            ),
            settings: settings,
          );
        }
        final resetPath = passwordResetPath(settings.name);
        if (resetPath == AppRoutes.resetPassword) {
          return MaterialPageRoute(
            builder: (_) => ResetPasswordPage(
              token: passwordResetTokenFromRouteName(settings.name) ?? '',
            ),
            settings: settings,
          );
        }
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
          final focusBannerId = args is Map
              ? args['focusBannerId']?.toString()
              : null;
          return MaterialPageRoute(
            builder: (_) => VenuePublicScreen(
              venueId: venueId,
              navIndex: navIndex,
              focusBannerId: focusBannerId,
            ),
            settings: settings,
          );
        }
        return null;
      },
    );
  }
}
