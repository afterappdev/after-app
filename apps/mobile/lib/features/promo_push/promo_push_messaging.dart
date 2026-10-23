import 'promo_push_message.dart';

enum PromoOsPermission { granted, denied, unavailable }

abstract class PromoPushMessaging {
  Future<bool> initialize();

  Future<PromoOsPermission> currentPermission();

  Future<PromoOsPermission> requestPermission();

  Future<String?> getToken();

  Stream<String> get onTokenRefresh;

  Stream<PromoPushMessage> get onForeground;

  Stream<PromoPushMessage> get onOpened;

  Future<PromoPushMessage?> initialMessage();

  Future<void> showForeground(PromoPushMessage message);

  void bindLocalTap(void Function(PromoPushMessage message) onTap);

  bool get isAndroid;
}

class UnavailablePromoPushMessaging implements PromoPushMessaging {
  @override
  Future<bool> initialize() async => false;

  @override
  Future<PromoOsPermission> currentPermission() async =>
      PromoOsPermission.unavailable;

  @override
  Future<PromoOsPermission> requestPermission() async =>
      PromoOsPermission.unavailable;

  @override
  Future<String?> getToken() async => null;

  @override
  Stream<String> get onTokenRefresh => const Stream.empty();

  @override
  Stream<PromoPushMessage> get onForeground => const Stream.empty();

  @override
  Stream<PromoPushMessage> get onOpened => const Stream.empty();

  @override
  Future<PromoPushMessage?> initialMessage() async => null;

  @override
  Future<void> showForeground(PromoPushMessage message) async {}

  @override
  void bindLocalTap(void Function(PromoPushMessage message) onTap) {}

  @override
  bool get isAndroid => false;
}
