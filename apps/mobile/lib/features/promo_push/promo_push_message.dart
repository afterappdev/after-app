class PromoPushMessage {
  const PromoPushMessage({
    required this.title,
    required this.body,
    required this.eventId,
    required this.bannerId,
    required this.venueId,
    required this.scheduleId,
  });

  final String title;
  final String body;
  final String eventId;
  final String bannerId;
  final String venueId;
  final String scheduleId;

  bool get canOpen =>
      eventId.isNotEmpty && bannerId.isNotEmpty && venueId.isNotEmpty;

  static PromoPushMessage? parse({
    String? title,
    String? body,
    Map<String, dynamic>? data,
  }) {
    final payload = data ?? const <String, dynamic>{};
    if (payload['type']?.toString() != 'PROMO_PUBLISHED') return null;
    final receivedTitle = title?.trim() ?? '';
    return PromoPushMessage(
      title: receivedTitle.isEmpty
          ? 'Um estabelecimento publicou uma novidade para hoje!'
          : receivedTitle,
      body: (body?.trim().isNotEmpty ?? false)
          ? body!.trim()
          : 'Confira o que está rolando na sua cidade. Toque para ver!',
      eventId: payload['eventId']?.toString() ?? '',
      bannerId: payload['bannerId']?.toString() ?? '',
      venueId: payload['venueId']?.toString() ?? '',
      scheduleId: payload['scheduleId']?.toString() ?? '',
    );
  }
}

class PromoDeliveryLedger {
  final Set<String> _bannerIds = {};

  void rememberBanner(String? bannerId) {
    final id = bannerId?.trim() ?? '';
    if (id.isEmpty) return;
    _bannerIds.add(id);
  }

  bool alreadyShown(String? bannerId) {
    final id = bannerId?.trim() ?? '';
    if (id.isEmpty) return false;
    return _bannerIds.contains(id);
  }
}
