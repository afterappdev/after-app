import 'card_brick_host.dart';
import 'card_brick_stub.dart'
    if (dart.library.html) 'card_brick_web.dart' as platform;

export 'card_brick_host.dart';

CardBrickHost createCardBrickHost() => platform.createPlatformCardBrickHost();
