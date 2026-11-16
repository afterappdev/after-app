import 'package:shared_preferences/shared_preferences.dart';

/// One-shot legacy activation offer per account on this install.
enum PromoLegacyOfferDecision { dismissed, accepted }

abstract class PromoLegacyOfferMemory {
  Future<PromoLegacyOfferDecision?> decision(String userId);
  Future<void> remember(String userId, PromoLegacyOfferDecision value);
}

class PreferencesPromoLegacyOfferMemory implements PromoLegacyOfferMemory {
  String _key(String userId) => 'promo_legacy_offer_$userId';

  @override
  Future<PromoLegacyOfferDecision?> decision(String userId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key(userId));
    if (raw == 'accepted') return PromoLegacyOfferDecision.accepted;
    if (raw == 'dismissed') return PromoLegacyOfferDecision.dismissed;
    return null;
  }

  @override
  Future<void> remember(String userId, PromoLegacyOfferDecision value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _key(userId),
      value == PromoLegacyOfferDecision.accepted ? 'accepted' : 'dismissed',
    );
  }
}

/// Native permission prompt once per account on this install (server already on).
abstract class PromoOsPromptMemory {
  Future<bool> hasPrompted(String userId);
  Future<void> markPrompted(String userId);
}

class MemoryPromoLegacyOfferMemory implements PromoLegacyOfferMemory {
  final Map<String, PromoLegacyOfferDecision> _data = {};

  @override
  Future<PromoLegacyOfferDecision?> decision(String userId) async =>
      _data[userId];

  @override
  Future<void> remember(String userId, PromoLegacyOfferDecision value) async {
    _data[userId] = value;
  }
}

class MemoryPromoOsPromptMemory implements PromoOsPromptMemory {
  final Set<String> _prompted = {};

  @override
  Future<bool> hasPrompted(String userId) async => _prompted.contains(userId);

  @override
  Future<void> markPrompted(String userId) async {
    _prompted.add(userId);
  }
}

class PreferencesPromoOsPromptMemory implements PromoOsPromptMemory {
  String _key(String userId) => 'promo_os_prompted_$userId';

  @override
  Future<bool> hasPrompted(String userId) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_key(userId)) ?? false;
  }

  @override
  Future<void> markPrompted(String userId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_key(userId), true);
  }
}