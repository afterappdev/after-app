import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/location/device_locator.dart';
import '../auth/auth_controller.dart';
import '../auth/models/user_session.dart';
import 'municipality_geocoder.dart';
import 'promo_push_api.dart';
import 'promo_push_message.dart';
import 'promo_push_messaging.dart';
import 'promo_push_router.dart';

abstract class PromoCityMemory {
  Future<DateTime?> lastReportedAt(String userId);
  Future<void> remember(String userId, DateTime at);
  Future<void> clear(String userId);
}

class MemoryPromoCityMemory implements PromoCityMemory {
  final Map<String, DateTime> _times = {};

  @override
  Future<void> clear(String userId) async {
    _times.remove(userId);
  }

  @override
  Future<DateTime?> lastReportedAt(String userId) async => _times[userId];

  @override
  Future<void> remember(String userId, DateTime at) async {
    _times[userId] = at;
  }
}

class PreferencesPromoCityMemory implements PromoCityMemory {
  String _key(String userId) => 'promo_city_reported_at_$userId';

  @override
  Future<void> clear(String userId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key(userId));
  }

  @override
  Future<DateTime?> lastReportedAt(String userId) async {
    final prefs = await SharedPreferences.getInstance();
    final millis = prefs.getInt(_key(userId));
    if (millis == null) return null;
    return DateTime.fromMillisecondsSinceEpoch(millis);
  }

  @override
  Future<void> remember(String userId, DateTime at) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_key(userId), at.millisecondsSinceEpoch);
  }
}

class PromoPushCoordinator extends ChangeNotifier {
  PromoPushCoordinator({
    required this.api,
    required this.messaging,
    required this.ledger,
    required this.router,
    required this.cityMemory,
    this.geocoder,
    this.locator,
    this.onSessionEnd,
    this.locationMaxAge = const Duration(hours: 6),
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  final PromoPushApi api;
  final PromoPushMessaging messaging;
  final PromoDeliveryLedger ledger;
  final PromoPushRouter router;
  final PromoCityMemory cityMemory;
  final MunicipalityGeocoder? geocoder;
  final DeviceLocator? locator;
  final Future<void> Function()? onSessionEnd;
  final Duration locationMaxAge;
  final DateTime Function() _now;

  bool enabled = false;
  bool loaded = false;
  bool preferenceKnown = false;
  bool saving = false;
  String? statusMessage;
  String? _token;
  String? _userId;
  UserSession? _session;
  PromoPushMessage? pendingMessage;
  bool _started = false;
  bool _cityAttempted = false;

  static const firebaseUnavailableMessage =
      'Não foi possível preparar as notificações neste aparelho. '
      'Use uma versão do app com Firebase configurado (google-services.json).';

  static const permissionBlockedMessage =
      'A preferência foi salva, mas o Android está bloqueando os avisos. '
      'Abra Ajustes → Apps → After → Notificações e permita os alertas.';
  StreamSubscription<String>? _refreshSub;
  StreamSubscription<PromoPushMessage>? _foregroundSub;
  StreamSubscription<PromoPushMessage>? _openedSub;

  Future<void> start(AuthController auth) async {
    if (_started) return;
    _started = true;
    auth.beforeSessionEnd = detachCurrentDevice;
    auth.addListener(() {
      final user = auth.user;
      if (user == null || (user.id == _userId && preferenceKnown)) return;
      unawaited(onAuthenticated(user));
    });
    messaging.bindLocalTap(receiveOpened);
    await messaging.initialize();
    _foregroundSub = messaging.onForeground.listen(receiveForeground);
    _openedSub = messaging.onOpened.listen(receiveOpened);
    _refreshSub = messaging.onTokenRefresh.listen((token) {
      unawaited(syncToken(token));
    });
    if (auth.user != null) {
      await onAuthenticated(auth.user!);
    }
  }

  Future<void> onAuthenticated(UserSession user) async {
    if (user.isVenue) {
      enabled = false;
      loaded = true;
      preferenceKnown = false;
      notifyListeners();
      return;
    }
    _userId = user.id;
    _session = user;
    try {
      final preference = await api.getPreferences();
      enabled = preference.enabled;
      preferenceKnown = true;
      loaded = true;
      statusMessage = null;
    } catch (_) {
      loaded = true;
      preferenceKnown = false;
      statusMessage = 'Não foi possível carregar a preferência de avisos.';
    }
    notifyListeners();
    await syncToken(_token ?? await _currentToken());
    await refreshAuthorizedCity(user);
    await consumePending();
  }

  Future<void> reloadPreference() async {
    final user = _session;
    if (user == null) return;
    await onAuthenticated(user);
  }

  Future<void> setEnabled(bool value) async {
    if (saving || _userId == null) return;
    saving = true;
    statusMessage = null;
    notifyListeners();
    final previous = enabled;
    late final PromoPreference saved;
    try {
      saved = await api.setEnabled(value);
    } catch (_) {
      enabled = previous;
      statusMessage = 'Não foi possível salvar a preferência. Tente novamente.';
      saving = false;
      notifyListeners();
      return;
    }
    enabled = saved.enabled;
    preferenceKnown = true;
    try {
      if (!saved.enabled) {
        await unregisterDevice();
        statusMessage = null;
      } else {
        if (!await _ensureMessagingReady()) {
          saving = false;
          notifyListeners();
          return;
        }
        final permission = await messaging.requestPermission();
        if (permission == PromoOsPermission.granted) {
          await syncToken(await messaging.getToken());
          if (_token == null && statusMessage == null) {
            statusMessage =
                'Preferência salva, mas este aparelho ainda não foi registrado.';
          }
        } else if (permission == PromoOsPermission.denied) {
          statusMessage = permissionBlockedMessage;
        } else if (permission == PromoOsPermission.unavailable) {
          statusMessage = firebaseUnavailableMessage;
        }
        final session = _session;
        if (session != null) await refreshAuthorizedCity(session);
      }
    } catch (_) {
      statusMessage ??=
          'Preferência salva, mas este aparelho ainda não foi registrado.';
    } finally {
      saving = false;
      notifyListeners();
    }
  }

  Future<void> syncToken(String? token) async {
    final next = token?.trim() ?? '';
    if (next.isEmpty || _userId == null || !enabled) return;
    if (!await _ensureMessagingReady()) return;
    final permission = await messaging.currentPermission();
    if (permission != PromoOsPermission.granted) return;
    final previous = _token;
    try {
      await api.registerToken(next);
      _token = next;
      if (statusMessage == 'Não foi possível registrar este aparelho.') {
        statusMessage = null;
      }
    } catch (_) {
      _token = previous;
      statusMessage = 'Não foi possível registrar este aparelho.';
    }
    notifyListeners();
  }

  Future<void> unregisterDevice() async {
    final token = _token ?? await _currentToken();
    _token = null;
    if (token == null || token.trim().isEmpty) return;
    try {
      await api.unregisterToken(token.trim());
    } catch (_) {}
  }

  Future<void> detachCurrentDevice() async {
    final userId = _userId;
    _userId = null;
    _session = null;
    enabled = false;
    preferenceKnown = false;
    pendingMessage = null;
    _cityAttempted = false;
    router.reset();
    await unregisterDevice();
    if (userId != null) await cityMemory.clear(userId);
    try {
      await onSessionEnd?.call();
    } catch (_) {}
    notifyListeners();
  }

  Future<void> refreshAuthorizedCity(UserSession user) async {
    final locator = this.locator;
    final geocoder = this.geocoder;
    if (!enabled || user.isVenue || geocoder == null || locator == null) {
      return;
    }
    final last = await cityMemory.lastReportedAt(user.id);
    if (last != null && _now().difference(last) < locationMaxAge) return;
    if (_cityAttempted) return;
    if (!await _foregroundAlreadyGranted(locator)) return;
    _cityAttempted = true;
    final origin = await locator.currentPosition();
    if (origin == null) return;
    final municipality = await geocoder.reverse(origin.lat, origin.lng);
    if (municipality == null) return;
    try {
      await api.setLocation(city: municipality.city, state: municipality.state);
      await cityMemory.remember(user.id, _now());
    } catch (_) {
      _cityAttempted = false;
    }
  }

  Future<void> receiveForeground(PromoPushMessage message) async {
    ledger.rememberBanner(message.bannerId);
    await messaging.showForeground(message);
  }

  Future<void> receiveOpened(PromoPushMessage message) async {
    ledger.rememberBanner(message.bannerId);
    if (_userId == null) {
      pendingMessage = message;
      return;
    }
    await router.open(message);
  }

  Future<void> consumeLaunchMessage() async {
    final message = await messaging.initialMessage();
    if (message == null) return;
    await receiveOpened(message);
  }

  Future<void> consumePending() async {
    final message = pendingMessage;
    if (message == null || _userId == null) return;
    pendingMessage = null;
    await router.open(message);
  }

  Future<String?> _currentToken() async {
    try {
      return await messaging.getToken();
    } catch (_) {
      return null;
    }
  }

  Future<bool> _ensureMessagingReady() async {
    if (messaging.isReady) return true;
    final ready = await messaging.ensureReady();
    if (!ready) {
      statusMessage = firebaseUnavailableMessage;
      notifyListeners();
    }
    return ready;
  }

  Future<bool> _foregroundAlreadyGranted(DeviceLocator locator) async {
    if (!await locator.isServiceEnabled()) return false;
    final permission = await locator.checkPermission();
    return permission == LocationPermission.whileInUse ||
        permission == LocationPermission.always;
  }

  @override
  void dispose() {
    _refreshSub?.cancel();
    _foregroundSub?.cancel();
    _openedSub?.cancel();
    super.dispose();
  }
}
