import 'package:google_sign_in/google_sign_in.dart';

import '../../core/config/oauth_config.dart';

/// Local Google SDK session. Does not revoke After's server account.
abstract class GoogleSessionCleaner {
  Future<void> signOut();
  Future<void> disconnect();
}

class PluginGoogleSessionCleaner implements GoogleSessionCleaner {
  GoogleSignIn _client() {
    final clientId = OauthConfig.googleClientId;
    final serverClientId = OauthConfig.googleNativeServerClientId;
    return GoogleSignIn(
      scopes: const ['email', 'profile', 'openid'],
      clientId: clientId.isEmpty ? null : clientId,
      serverClientId: serverClientId.isEmpty ? null : serverClientId,
    );
  }

  @override
  Future<void> signOut() async {
    try {
      await _client().signOut();
    } catch (_) {
      // Plugin ausente, web sem sessão ou usuário só com e-mail/Apple.
    }
  }

  @override
  Future<void> disconnect() async {
    try {
      await _client().disconnect();
    } catch (_) {
      await signOut();
    }
  }
}
