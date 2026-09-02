import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../../core/auth/auth_storage.dart';
import '../../core/network/api_client.dart';
import 'models/user_session.dart';
import 'models/social_onboarding.dart';

class AuthController extends ChangeNotifier {
  AuthController({
    required this.api,
    required this.storage,
  });

  final ApiClient api;
  final AuthStorage storage;

  UserSession? user;
  SocialOnboarding? pendingSocialOnboarding;
  bool bootstrapping = true;
  String? error;

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
      await _persist(data);
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

  Future<void> loginWithAccessToken(String accessToken) async {
    error = null;
    notifyListeners();
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
        if (password != null && password.isNotEmpty) 'password': password,
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

  Future<void> logout() async {
    await storage.clear();
    api.setToken(null);
    user = null;
    pendingSocialOnboarding = null;
    notifyListeners();
  }

  Future<void> deleteAccount() async {
    await api.delete('/users/me');
    await logout();
  }

  Future<void> updateProfile({
    required String name,
    required String state,
    required String city,
    String? avatarUrl,
  }) async {
    final data = await api.patch('/users/me', body: {
      'name': name.trim(),
      'state': state.trim(),
      'city': city.trim(),
      'avatarUrl': avatarUrl ?? '',
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
    await _persist(data);
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
    api.setToken(token);
    await storage.saveSession(
      token: token,
      userJson: jsonEncode(session.toJson()),
    );
    user = session;
    notifyListeners();
  }
}
