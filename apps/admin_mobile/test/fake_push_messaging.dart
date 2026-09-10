import 'dart:async';

import 'package:after_admin/core/push/push_messaging.dart';
import 'package:after_admin/core/push/push_payload.dart';

class FakePushMessaging implements PushMessaging {
  FakePushMessaging({
    this.initializeResult = true,
    this.permissionGranted = true,
    this.token = 'fcm-test-token-123456',
    this.platformName = 'android',
    this.initialMessage,
  });

  bool initializeResult;
  bool permissionGranted;
  String? token;
  @override
  String platformName;
  AdminPushMessage? initialMessage;

  final tokenRefresh = StreamController<String>.broadcast();
  final foreground = StreamController<AdminPushMessage>.broadcast();
  final opened = StreamController<AdminPushMessage>.broadcast();
  int initializeCalls = 0;
  int permissionCalls = 0;

  @override
  Future<bool> initialize() async {
    initializeCalls += 1;
    return initializeResult;
  }

  @override
  Future<bool> requestPermission() async {
    permissionCalls += 1;
    return permissionGranted;
  }

  @override
  Future<String?> getToken() async => token;

  @override
  Stream<String> get onTokenRefresh => tokenRefresh.stream;

  @override
  Stream<AdminPushMessage> get onForeground => foreground.stream;

  @override
  Stream<AdminPushMessage> get onOpened => opened.stream;

  @override
  Future<AdminPushMessage?> getInitialMessage() async => initialMessage;
}
