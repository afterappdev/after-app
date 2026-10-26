import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../../core/auth/auth_storage.dart';
import '../../core/network/api_client.dart';
import 'google_session.dart';
import 'models/deletion_status.dart';
import 'models/user_session.dart';
import 'models/social_onboarding.dart';

const _accountRecoveryJwtTyp = 'account_recovery';

class AuthController extends ChangeNotifier {
  AuthController({
    required this.api,
    required this.storage,
    GoogleSessionCleaner? googleSession,
  }) : googleSession = googleSession ?? PluginGoogleSessionCleaner() {
    api.onUnauthorized = invalidateExpiredSession;
  }

  final ApiClient api;
  final AuthStorage storage;
  final GoogleSessionCleaner googleSession;

  UserSession? user;
  SocialOnboarding? pendingSocialOnboarding;
  PendingAccountRecovery? pendingAccountRecovery;
  String? postRecoveryLoginMessage;

  /// Runs while the current access token is still valid, before logout or
  /// before another account replaces the session.
  Future<void> Function()? beforeSessionEnd;
  bool bootstrapping = true;
  String? error;
  String? _oauthError;

  void presentOAuthError(String message) {
    final trimmed = message.trim();
    if (trimmed.isEmpty) return;
    _oauthError = trimmed.length > 180 ? trimmed.substring(0, 180) : trimmed;
    notifyListeners();
  }

  String? takeOAuthError() {
    final message = _oauthError;
    _oauthError = null;
    return message;
  }

  Future<void> bootstrap() async {
    bootstrapping = true;
    notifyListeners();
    try {
      final token = await storage.readToken();
      final userJson = await storage.readUserJson();
      if (token != null && userJson != null) {
        api.setToken(token);
        user = UserSession.fromJson(
          jsonDecode(userJson) as Map<String, dynamic>,
        );
      }
    } finally {
      bootstrapping = false;
      notifyListeners();
    }
  }

  Future<void> login({
    required String email,
    required String password,
  }) async {
    error = null;
    notifyListeners();
    try {
      final data = await api.post('/auth/login', body: {
        'email': email.trim(),
        'password': password,
      }) as Map<String, dynamic>;
      await _applyAuthPayload(data);
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> loginWithGoogle({required String idToken}) async {
    error = null;
    notifyListeners();
    try {
      final data = await api.post('/auth/google', body: {
        'idToken': idToken,
      }) as Map<String, dynamic>;
      await _applySocialAuthResponse(data);
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> loginWithApple({
    required String identityToken,
    String? authorizationCode,
    String? email,
    String? fullName,
  }) async {
    error = null;
    notifyListeners();
    try {
      final data = await api.post('/auth/apple', body: {
        'identityToken': identityToken,
        if (authorizationCode != null && authorizationCode.isNotEmpty)
          'authorizationCode': authorizationCode,
        if (email != null && email.isNotEmpty) 'email': email,
        if (fullName != null && fullName.isNotEmpty) 'fullName': fullName,
      }) as Map<String, dynamic>;
      await _applySocialAuthResponse(data);
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> exchangeAppleWebLogin(String code) async {
    error = null;
    notifyListeners();
    try {
      final data = await api.post('/auth/apple/web/exchange', body: {
        'code': code,
      }) as Map<String, dynamic>;
      await _applySocialAuthResponse(data);
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> loginWithAccessToken(String accessToken) async {
    error = null;
    notifyListeners();
    final payload = decodeUnverifiedJwtPayload(accessToken);
    if (payload?['typ'] == _accountRecoveryJwtTyp) {
      await _loadPendingRecoveryFromToken(accessToken);
      return;
    }
    api.setToken(accessToken);
    try {
      final data = await api.get('/users/me') as Map<String, dynamic>;
      final venue = data['venue'];
      await _persist({
        'accessToken': accessToken,
        'user': {
          'id': data['id'],
          'name': data['name'],
          'email': data['email'],
          'role': data['role'],
          'state': data['state'],
          'city': data['city'],
          'avatarUrl': data['avatarUrl'],
          'venueId': venue is Map<String, dynamic>
              ? venue['id']
              : data['venueId'],
        },
      });
    } on ApiException catch (e) {
      api.setToken(null);
      error = e.message;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> register({
    required String name,
    required String email,
    required String password,
    required String state,
    required String city,
    required String role,
    String? documentType,
    String? documentNumber,
    String? ageBand,
  }) async {
    error = null;
    notifyListeners();
    try {
      final data = await api.post('/auth/register', body: {
        'name': name.trim(),
        'email': email.trim(),
        'password': password,
        'state': state.trim(),
        'city': city.trim(),
        'role': role,
        if (kIsWeb) 'registrationChannel': 'after_web',
        if (role == 'VENUE' && documentType != null)
          'documentType': documentType,
        if (role == 'VENUE' && documentNumber != null)
          'documentNumber': documentNumber,
        if (role == 'USER' && ageBand != null) 'ageBand': ageBand,
      }) as Map<String, dynamic>;
      await _persist(data);
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> completeSocialRegistration({
    required String onboardingToken,
    required String accountType,
    required String name,
    required String state,
    required String city,
    String? password,
    String? documentType,
    String? documentNumber,
    String? ageBand,
  }) async {
    error = null;
    notifyListeners();
    try {
      final data = await api.post('/auth/social/complete-registration', body: {
        'onboardingToken': onboardingToken,
        'accountType': accountType,
        'name': name.trim(),
        'state': state.trim(),
        'city': city.trim(),
        if (kIsWeb) 'registrationChannel': 'after_web',
        if (password != null && password.isNotEmpty) 'password': password,
        if (accountType == 'venue' && documentType != null)
          'documentType': documentType,
        if (accountType == 'venue' && documentNumber != null)
          'documentNumber': documentNumber,
        if (accountType == 'user' && ageBand != null) 'ageBand': ageBand,
      }) as Map<String, dynamic>;
      pendingSocialOnboarding = null;
      await _persist(data);
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      rethrow;
    }
  }

  void beginSocialOnboardingFromToken(String onboardingToken) {
    final payload = decodeUnverifiedJwtPayload(onboardingToken);
    if (payload == null || payload['typ'] != 'social_onboarding') {
      return;
    }
    pendingSocialOnboarding = SocialOnboarding.fromJwt(onboardingToken);
    notifyListeners();
  }

  void clearPendingSocialOnboarding() {
    if (pendingSocialOnboarding == null) return;
    pendingSocialOnboarding = null;
    notifyListeners();
  }

  Future<void>? _sessionClearing;

  Future<void> logout() => _clearSession();

  /// Idempotent. Used when a Bearer token is rejected with 401.
  /// Does not show dialogs; AppStartup/listeners react to [user] == null.
  Future<void> invalidateExpiredSession() => _clearSession();

  Future<void> _clearSession() {
    final inFlight = _sessionClearing;
    if (inFlight != null) return inFlight;
    return _sessionClearing = _clearSessionBody();
  }

  Future<void> _endPreviousSession() async {
    final hook = api.onUnauthorized;
    api.onUnauthorized = null;
    try {
      await beforeSessionEnd?.call();
    } catch (_) {
    } finally {
      api.onUnauthorized = hook;
    }
  }

  Future<void> _clearSessionBody() async {
    try {
      await _endPreviousSession();
      api.setToken(null);
      await googleSession.signOut();
      await storage.clear();
      user = null;
      pendingSocialOnboarding = null;
      pendingAccountRecovery = null;
      notifyListeners();
    } finally {
      _sessionClearing = null;
    }
  }

  Future<void> requestAccountDeletion() async {
    await api.post('/users/me/deletion-request');
    await googleSession.disconnect();
    await logout();
  }

  Future<void> deleteAccount() => requestAccountDeletion();

  Future<void> cancelAccountDeletionRecovery() async {
    final pending = pendingAccountRecovery;
    if (pending == null) {
      throw StateError('Nenhuma recuperação pendente');
    }
    final hook = api.onUnauthorized;
    api.onUnauthorized = null;
    try {
      api.setToken(pending.recoveryToken);
      try {
        await api.post('/users/me/deletion-cancel');
      } finally {
        api.setToken(null);
      }
    } finally {
      api.onUnauthorized = hook;
    }
    pendingAccountRecovery = null;
    postRecoveryLoginMessage =
        'Conta recuperada! Entre novamente com e-mail, Google ou Apple.';
    notifyListeners();
  }

  void abandonAccountRecovery() {
    if (pendingAccountRecovery == null) return;
    pendingAccountRecovery = null;
    notifyListeners();
  }

  String? takePostRecoveryLoginMessage() {
    final message = postRecoveryLoginMessage;
    postRecoveryLoginMessage = null;
    return message;
  }

  Future<void> updateProfile({
    required String name,
    required String state,
    required String city,
    String? avatarUrl,
    String? ageBand,
  }) async {
    final data = await api.patch('/users/me', body: {
      'name': name.trim(),
      'state': state.trim(),
      'city': city.trim(),
      'avatarUrl': avatarUrl ?? '',
      'ageBand': ?ageBand,
    }) as Map<String, dynamic>;
    await _updateStoredUser(
      UserSession(
        id: data['id'] as String? ?? user!.id,
        name: data['name'] as String,
        email: data['email'] as String? ?? user!.email,
        role: data['role'] as String? ?? user!.role,
        state: data['state'] as String,
        city: data['city'] as String,
        avatarUrl: data['avatarUrl'] as String?,
        venueId: user?.venueId,
      ),
    );
  }

  Future<void> updateLocation({
    required String state,
    required String city,
  }) async {
    if (user == null) return;
    final data = await api.patch('/users/me', body: {
      'state': state.trim(),
      'city': city.trim(),
    }) as Map<String, dynamic>;
    await _updateStoredUser(
      UserSession(
        id: data['id'] as String? ?? user!.id,
        name: data['name'] as String? ?? user!.name,
        email: data['email'] as String? ?? user!.email,
        role: data['role'] as String? ?? user!.role,
        state: data['state'] as String,
        city: data['city'] as String,
        avatarUrl: data['avatarUrl'] as String? ?? user!.avatarUrl,
        venueId: user?.venueId,
      ),
    );
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await api.patch('/users/me/password', body: {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
  }

  Future<void> _applySocialAuthResponse(Map<String, dynamic> data) async {
    if (data['needsRegistration'] == true) {
      pendingSocialOnboarding = SocialOnboarding.fromResponse(data);
      notifyListeners();
      return;
    }
    pendingSocialOnboarding = null;
    await _applyAuthPayload(data);
  }

  Future<void> _applyAuthPayload(Map<String, dynamic> data) async {
    if (data['accountPendingDeletion'] == true) {
      pendingAccountRecovery = PendingAccountRecovery.fromLoginResponse(data);
      pendingSocialOnboarding = null;
      notifyListeners();
      return;
    }
    pendingAccountRecovery = null;
    await _persist(data);
  }

  Future<void> _loadPendingRecoveryFromToken(String recoveryToken) async {
    final hook = api.onUnauthorized;
    api.onUnauthorized = null;
    try {
      api.setToken(recoveryToken);
      try {
        final status = await api.get('/users/me/deletion-status')
            as Map<String, dynamic>;
        pendingAccountRecovery = PendingAccountRecovery(
          recoveryToken: recoveryToken,
          status: DeletionStatus.fromJson(status),
        );
        pendingSocialOnboarding = null;
        notifyListeners();
      } on ApiException catch (e) {
        error = e.statusCode == 401
            ? 'Sua sessão de recuperação expirou. Faça login novamente.'
            : e.message;
        notifyListeners();
        rethrow;
      } finally {
        api.setToken(null);
      }
    } finally {
      api.onUnauthorized = hook;
    }
  }

  Future<void> _updateStoredUser(UserSession session) async {
    final token = await storage.readToken();
    user = session;
    if (token != null) {
      await storage.saveSession(
        token: token,
        userJson: jsonEncode(session.toJson()),
      );
    }
    notifyListeners();
  }

  Future<void> _persist(Map<String, dynamic> data) async {
    final token = data['accessToken'] as String;
    final session = UserSession.fromJson(data['user'] as Map<String, dynamic>);
    if (user != null && user!.id != session.id) {
      await _endPreviousSession();
    }
    api.setToken(token);
    await storage.saveSession(
      token: token,
      userJson: jsonEncode(session.toJson()),
    );
    user = session;
    notifyListeners();
  }
}
