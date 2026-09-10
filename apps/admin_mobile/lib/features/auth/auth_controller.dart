import 'package:flutter/foundation.dart';

import '../../core/network/api_client.dart';
import '../../core/push/admin_push_coordinator.dart';
import '../../core/storage/secure_token_store.dart';
import '../../data/admin_api.dart';
import '../../data/admin_session.dart';

class AuthController extends ChangeNotifier {
  AuthController({
    required this.api,
    required this.client,
    required this.storage,
    this.push,
  });

  final AdminApi api;
  final ApiClient client;
  final TokenStore storage;
  final AdminPushCoordinator? push;

  AdminMe? user;
  bool bootstrapping = true;
  bool submitting = false;
  String? error;

  bool get isAuthenticated => user != null;

  Future<void> bootstrap() async {
    bootstrapping = true;
    notifyListeners();
    try {
      final token = await storage.readToken();
      if (token == null || token.isEmpty) return;
      client.setToken(token);
      user = await api.me();
      await _startPush();
    } on ApiException {
      await _clearSession();
    } finally {
      bootstrapping = false;
      client.onUnauthorized = logout;
      notifyListeners();
    }
  }

  Future<bool> login({required String email, required String password}) async {
    error = null;
    submitting = true;
    notifyListeners();
    try {
      final result = await api.login(
        email: email.trim().toLowerCase(),
        password: password,
      );
      if (result.accessToken.isEmpty) {
        throw ApiException('Resposta de login inválida.');
      }
      await storage.saveToken(result.accessToken);
      client.setToken(result.accessToken);
      user = await api.me();
      await _startPush();
      return true;
    } on ApiException catch (e) {
      await _clearSession();
      error = e.message;
      return false;
    } finally {
      submitting = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    try {
      await push?.stop();
    } catch (_) {}
    await _clearSession();
    notifyListeners();
  }

  Future<void> _startPush() async {
    try {
      await push?.start();
    } catch (_) {}
  }

  Future<void> _clearSession() async {
    user = null;
    client.setToken(null);
    await storage.clear();
  }
}
