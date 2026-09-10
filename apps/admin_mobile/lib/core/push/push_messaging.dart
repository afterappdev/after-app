import 'push_payload.dart';

abstract class PushMessaging {
  Future<bool> initialize();

  Future<bool> requestPermission();

  Future<String?> getToken();

  Stream<String> get onTokenRefresh;

  Stream<AdminPushMessage> get onForeground;

  Stream<AdminPushMessage> get onOpened;

  Future<AdminPushMessage?> getInitialMessage();

  String get platformName;
}

class NoopPushMessaging implements PushMessaging {
  @override
  Future<bool> initialize() async => false;

  @override
  Future<bool> requestPermission() async => false;

  @override
  Future<String?> getToken() async => null;

  @override
  Stream<String> get onTokenRefresh => const Stream.empty();

  @override
  Stream<AdminPushMessage> get onForeground => const Stream.empty();

  @override
  Stream<AdminPushMessage> get onOpened => const Stream.empty();

  @override
  Future<AdminPushMessage?> getInitialMessage() async => null;

  @override
  String get platformName => 'android';
}
