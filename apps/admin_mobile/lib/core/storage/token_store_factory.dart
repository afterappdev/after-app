import 'token_store.dart';
import 'token_store_io.dart' if (dart.library.html) 'token_store_web.dart' as platform;

TokenStore createTokenStore() => platform.createPlatformTokenStore();
