import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../data/admin_api.dart';
import 'push_messaging.dart';
import 'push_payload.dart';

class AdminPushCoordinator extends ChangeNotifier {
  AdminPushCoordinator({required this.api, required this.messaging});

  final AdminApi api;
  final PushMessaging messaging;

  String? currentToken;
  PushNavTarget? pending;
  AdminPushMessage? foreground;
  bool permissionDenied = false;
  bool started = false;

  StreamSubscription<String>? _refreshSub;
  StreamSubscription<AdminPushMessage>? _foregroundSub;
  StreamSubscription<AdminPushMessage>? _openedSub;

  Future<void> start() async {
    if (started) return;
    final ready = await messaging.initialize();
    if (!ready) return;
    final allowed = await messaging.requestPermission();
    if (!allowed) {
      permissionDenied = true;
      notifyListeners();
      return;
    }
    permissionDenied = false;
    started = true;
    await _registerCurrentToken();
    _refreshSub ??= messaging.onTokenRefresh.listen(_registerToken);
    _foregroundSub ??= messaging.onForeground.listen((message) {
      foreground = message;
      notifyListeners();
    });
    _openedSub ??= messaging.onOpened.listen(_queueNavigation);
    final initial = await messaging.getInitialMessage();
    if (initial != null) {
      _queueNavigation(initial);
    }
  }

  Future<void> stop() async {
    final token = currentToken;
    currentToken = null;
    started = false;
    await _refreshSub?.cancel();
    await _foregroundSub?.cancel();
    await _openedSub?.cancel();
    _refreshSub = null;
    _foregroundSub = null;
    _openedSub = null;
    if (token != null && token.isNotEmpty) {
      try {
        await api.unregisterPushToken(token);
      } catch (_) {}
    }
  }

  PushNavTarget? takePending() {
    final value = pending;
    pending = null;
    return value;
  }

  AdminPushMessage? takeForeground() {
    final value = foreground;
    foreground = null;
    return value;
  }

  Future<void> _registerCurrentToken() async {
    final token = await messaging.getToken();
    if (token == null || token.isEmpty) return;
    await _registerToken(token);
  }

  Future<void> _registerToken(String token) async {
    currentToken = token;
    try {
      await api.registerPushToken(
        token: token,
        platform: messaging.platformName,
      );
    } catch (_) {}
  }

  void _queueNavigation(AdminPushMessage message) {
    if (message.target == null) return;
    pending = message.target;
    notifyListeners();
  }
}
