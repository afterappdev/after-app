import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/network/api_client.dart';
import 'push_notifications.dart';

class NotificationsController extends ChangeNotifier {
  NotificationsController({required this.api});

  final ApiClient api;

  static const _lastPushedKey = 'notifications_last_pushed_id';

  int unreadCount = 0;
  Timer? _timer;
  bool _started = false;
  bool _refreshing = false;
  String? _lastPushedId;

  Future<void> start() async {
    if (_started) {
      await refresh();
      return;
    }
    _started = true;
    final prefs = await SharedPreferences.getInstance();
    _lastPushedId = prefs.getString(_lastPushedKey);
    await refresh();
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 25), (_) {
      refresh(notifyPush: true);
    });
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    _started = false;
    unreadCount = 0;
    notifyListeners();
  }

  Future<void> refresh({bool notifyPush = false}) async {
    if (_refreshing) return;
    _refreshing = true;
    try {
      final data = await api.get('/notifications/unread-count');
      final raw = (data as Map)['count'];
      final count = raw is num ? raw.toInt() : int.tryParse('$raw') ?? 0;
      if (notifyPush && count > unreadCount) {
        await _pushLatest();
      }
      if (unreadCount != count) {
        unreadCount = count;
        notifyListeners();
      } else {
        unreadCount = count;
      }
    } on ApiException {
      // Keep the last known badge if the request fails.
    } finally {
      _refreshing = false;
    }
  }

  Future<void> markAllRead() async {
    try {
      await api.patch('/notifications/read-all');
      unreadCount = 0;
      notifyListeners();
    } on ApiException {
      // Ignore; the inbox still shows items.
    }
  }

  Future<void> markRead(String id) async {
    try {
      await api.patch('/notifications/$id/read');
      if (unreadCount > 0) {
        unreadCount -= 1;
        notifyListeners();
      }
    } on ApiException {
      // Ignore.
    }
  }

  Future<void> _pushLatest() async {
    try {
      final data = await api.get('/notifications');
      final items = (data as List<dynamic>? ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      if (items.isEmpty) return;
      final latest = items.first;
      final id = latest['id']?.toString();
      if (id == null || id == _lastPushedId) return;
      _lastPushedId = id;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_lastPushedKey, id);
      await showPushNotification(
        title: latest['title']?.toString() ?? 'Nova publicação',
        body: latest['body']?.toString() ?? 'Um local favorito publicou no After',
      );
    } on ApiException {
      // Ignore push failures.
    }
  }
}
