import '../venue/promo_validity.dart';

enum PromoPublicationStatus { available, unavailable }

PromoPublicationStatus promoPublicationStatus({
  required Map<String, dynamic>? venue,
  required String bannerId,
  DateTime? utcNow,
}) {
  if (venue == null || bannerId.trim().isEmpty) {
    return PromoPublicationStatus.unavailable;
  }
  final banners = venue['banners'];
  if (banners is! List) return PromoPublicationStatus.unavailable;
  Map<String, dynamic>? banner;
  for (final item in banners) {
    if (item is Map && item['id']?.toString() == bannerId) {
      banner = Map<String, dynamic>.from(item);
      break;
    }
  }
  if (banner == null) return PromoPublicationStatus.unavailable;
  final status = banner['status']?.toString();
  if (status == 'CANCELLED' || status == 'EXPIRED') {
    return PromoPublicationStatus.unavailable;
  }
  if (status != null && status != 'ACTIVE') {
    return PromoPublicationStatus.unavailable;
  }
  final schedules = banner['schedules'];
  final dates = schedules is List
      ? schedules.map((item) => item is Map ? item['displayDate'] : null)
      : const <dynamic>[];
  if (isPromotionExpired(dates, utcNow: utcNow)) {
    return PromoPublicationStatus.unavailable;
  }
  return PromoPublicationStatus.available;
}

const promoUnavailableMessage =
    'Esta publicação não está mais disponível.';
