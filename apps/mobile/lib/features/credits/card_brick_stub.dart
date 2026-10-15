import 'card_brick_host.dart';

CardBrickHost createPlatformCardBrickHost() => UnavailableCardBrickHost();

/// Desktop and tests without a browser. The secure card form exists only on the web.
class UnavailableCardBrickHost implements CardBrickHost {
  @override
  bool get usesPlatformView => false;

  @override
  void registerView(String viewType) {}

  @override
  Future<void> mount(CardBrickMountRequest request) async {}

  @override
  Future<void> unmount() async {}
}
