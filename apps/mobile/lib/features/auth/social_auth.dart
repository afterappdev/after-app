import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/auth/oauth_callback.dart';
import '../../core/config/api_config.dart';
import '../../core/config/oauth_config.dart';
import '../../core/network/api_client.dart';
import 'auth_controller.dart';

class SocialAuthCanceled implements Exception {}

class SocialAuth {
  SocialAuth({
    required this.api,
    required this.auth,
  });

  final ApiClient api;
  final AuthController auth;

  Future<void> signInWithGoogle() async {
    if (!kIsWeb) {
      try {
        final idToken = await _nativeGoogleIdToken();
        if (idToken != null) {
          await auth.loginWithGoogle(idToken: idToken);
          return;
        }
      } on SocialAuthCanceled {
        return;
      } catch (_) {
        // Cai no fluxo do navegador se o SDK nativo não estiver configurado.
      }
    }

    await _openBrowserOAuth('google');
  }

  Future<void> signInWithApple() async {
    if (!kIsWeb) {
      try {
        final available = await SignInWithApple.isAvailable();
        if (available) {
          final credential = await SignInWithApple.getAppleIDCredential(
            scopes: const [
              AppleIDAuthorizationScopes.email,
              AppleIDAuthorizationScopes.fullName,
            ],
          );
          final identityToken = credential.identityToken;
          if (identityToken == null || identityToken.isEmpty) {
            throw ApiException('Token da Apple indisponível neste dispositivo.');
          }
          final fullName = [
            credential.givenName,
            credential.familyName,
          ].whereType<String>().where((part) => part.trim().isNotEmpty).join(' ');
          await auth.loginWithApple(
            identityToken: identityToken,
            authorizationCode: credential.authorizationCode,
            email: credential.email,
            fullName: fullName.isEmpty ? null : fullName,
          );
          return;
        }
      } on SignInWithAppleAuthorizationException catch (e) {
        if (e.code == AuthorizationErrorCode.canceled) return;
        rethrow;
      } on SocialAuthCanceled {
        return;
      }
    }

    await _openBrowserOAuth('apple');
  }

  Future<String?> _nativeGoogleIdToken() async {
    final serverClientId = OauthConfig.googleNativeServerClientId;
    final clientId = OauthConfig.googleClientId;
    if (serverClientId.isEmpty && clientId.isEmpty) {
      return null;
    }

    final google = GoogleSignIn(
      scopes: const ['email', 'profile', 'openid'],
      clientId: clientId.isEmpty ? null : clientId,
      serverClientId: serverClientId.isEmpty ? null : serverClientId,
    );

    try {
      final account = await google.signIn();
      if (account == null) throw SocialAuthCanceled();
      final authentication = await account.authentication;
      return authentication.idToken;
    } on PlatformException catch (e) {
      if (e.code == 'sign_in_canceled' || e.code == 'ERROR_ABORTED_BY_USER') {
        throw SocialAuthCanceled();
      }
      rethrow;
    }
  }

  Future<void> _openBrowserOAuth(String provider) async {
    Map<String, dynamic> flags = {};
    try {
      flags = await api.get('/auth/providers') as Map<String, dynamic>;
    } catch (_) {
      flags = {};
    }

    final browserEnabled = provider == 'google'
        ? flags['googleBrowser'] == true
        : flags['appleBrowser'] == true;

    if (provider == 'google' && !browserEnabled) {
      throw ApiException(
        'Login com Google não configurado. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET na API.',
      );
    }
    if (provider == 'apple' && !browserEnabled) {
      throw ApiException(
        kIsWeb
            ? 'Login com Apple na web exige APPLE_SERVICE_ID e URL HTTPS de retorno.'
            : 'Login com Apple está disponível no iPhone/iPad. No Android, configure APPLE_SERVICE_ID na API.',
      );
    }

    final redirect = oauthBrowserRedirect(isWeb: kIsWeb, pageUri: Uri.base);
    final url = Uri.parse('${ApiConfig.baseUrl}/auth/$provider/start').replace(
      queryParameters: {'redirect': redirect},
    );

    final launched = await launchUrl(
      url,
      mode: kIsWeb ? LaunchMode.platformDefault : LaunchMode.externalApplication,
      webOnlyWindowName: kIsWeb ? '_self' : null,
    );
    if (!launched) {
      throw ApiException('Não foi possível abrir o login com $provider.');
    }
  }
}
