import 'dart:convert';
import 'dart:ui';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'promo_push_message.dart';
import 'promo_push_messaging.dart';

const promoAlertsChannelId = 'promo_alerts';

@pragma('vm:entry-point')
Future<void> promoPushFirebaseBackground(RemoteMessage message) async {
  // Android already presents the notification payload. A second local
  // notification here would duplicate it while the app is in the background.
}

PromoPushMessaging createPlatformPromoPushMessaging() =>
    FirebasePromoPushMessaging();

class FirebasePromoPushMessaging implements PromoPushMessaging {
  FirebaseMessaging? _messaging;
  final _local = FlutterLocalNotificationsPlugin();
  bool _ready = false;
  void Function(PromoPushMessage message)? _onLocalTap;

  @override
  bool get isAndroid => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  bool get _isIos =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  bool get _supportsNativePromo => isAndroid || _isIos;

  @override
  Future<bool> initialize() async {
    if (!_supportsNativePromo) return false;
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp();
      }
      _messaging = FirebaseMessaging.instance;
      if (_isIos) {
        await _messaging!.setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );
      }
      await _local.initialize(
        InitializationSettings(
          android: const AndroidInitializationSettings(
            '@drawable/ic_promo_notification',
          ),
          iOS: const DarwinInitializationSettings(),
        ),
        onDidReceiveNotificationResponse: (response) {
          final message = _messageFromPayload(response.payload);
          if (message != null) _onLocalTap?.call(message);
        },
      );
      await _local
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(
            const AndroidNotificationChannel(
              promoAlertsChannelId,
              'Promoções e eventos',
              description:
                  'Avisos quando estabelecimentos da sua cidade publicam para hoje.',
              importance: Importance.high,
            ),
          );
      FirebaseMessaging.onBackgroundMessage(promoPushFirebaseBackground);
      _ready = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<PromoOsPermission> currentPermission() async {
    final messaging = _messaging;
    if (messaging == null) return PromoOsPermission.unavailable;
    final settings = await messaging.getNotificationSettings();
    return _fromStatus(settings.authorizationStatus);
  }

  @override
  Future<PromoOsPermission> requestPermission() async {
    final messaging = _messaging;
    if (messaging == null) return PromoOsPermission.unavailable;
    final settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    return _fromStatus(settings.authorizationStatus);
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
  Stream<PromoPushMessage> get onForeground {
    return FirebaseMessaging.onMessage
        .map(_fromRemote)
        .where((message) => message != null)
        .cast<PromoPushMessage>();
  }

  @override
  Stream<PromoPushMessage> get onOpened {
    return FirebaseMessaging.onMessageOpenedApp
        .map(_fromRemote)
        .where((message) => message != null)
        .cast<PromoPushMessage>();
  }

  @override
  Future<PromoPushMessage?> initialMessage() async {
    if (!_ready) return null;
    final message = await FirebaseMessaging.instance.getInitialMessage();
    if (message == null) return null;
    return _fromRemote(message);
  }

  @override
  void bindLocalTap(void Function(PromoPushMessage message) onTap) {
    _onLocalTap = onTap;
  }

  @override
  Future<void> showForeground(PromoPushMessage message) async {
    if (!_ready) return;
    final id = message.eventId.hashCode & 0x7fffffff;
    await _local.show(
      id,
      message.title,
      message.body,
      NotificationDetails(
        android: const AndroidNotificationDetails(
          promoAlertsChannelId,
          'Promoções e eventos',
          channelDescription:
              'Avisos quando estabelecimentos da sua cidade publicam para hoje.',
          importance: Importance.high,
          priority: Priority.high,
          icon: '@drawable/ic_promo_notification',
          color: Color(0xFFF58634),
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      payload: jsonEncode({
        'type': 'PROMO_PUBLISHED',
        'title': message.title,
        'body': message.body,
        'eventId': message.eventId,
        'bannerId': message.bannerId,
        'venueId': message.venueId,
        'scheduleId': message.scheduleId,
      }),
    );
  }

  PromoOsPermission _fromStatus(AuthorizationStatus status) {
    switch (status) {
      case AuthorizationStatus.authorized:
      case AuthorizationStatus.provisional:
        return PromoOsPermission.granted;
      case AuthorizationStatus.denied:
      case AuthorizationStatus.deniedPermanently:
      case AuthorizationStatus.notDetermined:
        return PromoOsPermission.denied;
    }
  }

  PromoPushMessage? _messageFromPayload(String? payload) {
    if (payload == null || payload.isEmpty) return null;
    try {
      final decoded = jsonDecode(payload);
      if (decoded is! Map) return null;
      return PromoPushMessage.parse(
        title: decoded['title']?.toString(),
        body: decoded['body']?.toString(),
        data: Map<String, dynamic>.from(decoded),
      );
    } catch (_) {
      return null;
    }
  }

  PromoPushMessage? _fromRemote(RemoteMessage message) {
    return PromoPushMessage.parse(
      title: message.notification?.title ?? message.data['title']?.toString(),
      body: message.notification?.body ?? message.data['body']?.toString(),
      data: Map<String, dynamic>.from(message.data),
    );
  }
}
