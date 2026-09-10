import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'firebase_options_env.dart';
import 'push_messaging.dart';
import 'push_payload.dart';

class FirebasePushMessaging implements PushMessaging {
  FirebaseMessaging? _messaging;

  @override
  Future<bool> initialize() async {
    if (kIsWeb) return false;
    try {
      if (Firebase.apps.isEmpty) {
        final options = firebaseOptionsFromEnvironment();
        if (options != null) {
          await Firebase.initializeApp(options: options);
        } else {
          await Firebase.initializeApp();
        }
      }
      _messaging = FirebaseMessaging.instance;
      return true;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> requestPermission() async {
    final messaging = _messaging;
    if (messaging == null) return false;
    final settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  @override
  Future<String?> getToken() {
    return _messaging?.getToken() ?? Future.value();
  }

  @override
  Stream<String> get onTokenRefresh {
    final messaging = _messaging;
    if (messaging == null) return const Stream.empty();
    return messaging.onTokenRefresh;
  }

  @override
  Stream<AdminPushMessage> get onForeground {
    return FirebaseMessaging.onMessage.map(_fromRemote);
  }

  @override
  Stream<AdminPushMessage> get onOpened {
    return FirebaseMessaging.onMessageOpenedApp.map(_fromRemote);
  }

  @override
  Future<AdminPushMessage?> getInitialMessage() async {
    final message = await FirebaseMessaging.instance.getInitialMessage();
    if (message == null) return null;
    return _fromRemote(message);
  }

  @override
  String get platformName {
    switch (defaultTargetPlatform) {
      case TargetPlatform.iOS:
        return 'ios';
      default:
        return 'android';
    }
  }

  AdminPushMessage _fromRemote(RemoteMessage message) {
    return parseAdminPushMessage(
      title: message.notification?.title ?? message.data['title']?.toString(),
      body: message.notification?.body ?? message.data['body']?.toString(),
      data: Map<String, dynamic>.from(message.data),
    );
  }
}
