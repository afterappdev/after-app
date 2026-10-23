import 'promo_push_messaging.dart';
import 'promo_push_messaging_stub.dart'
    if (dart.library.io) 'promo_push_messaging_io.dart';

PromoPushMessaging createPromoPushMessaging() =>
    createPlatformPromoPushMessaging();
