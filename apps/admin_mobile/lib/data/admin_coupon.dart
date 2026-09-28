import 'json_util.dart';

class AdminCoupon {
  const AdminCoupon({
    required this.id,
    required this.code,
    required this.creditAmount,
    required this.active,
    required this.maxRedemptionsPerVenue,
    required this.redemptionCount,
    required this.createdAt,
    this.startsAt,
    this.expiresAt,
    this.maxRedemptions,
  });

  final String id;
  final String code;
  final int creditAmount;
  final bool active;
  final DateTime? startsAt;
  final DateTime? expiresAt;
  final int? maxRedemptions;
  final int maxRedemptionsPerVenue;
  final int redemptionCount;
  final DateTime createdAt;

  String get statusLabel {
    if (!active) return 'Inativo';
    final now = DateTime.now();
    if (startsAt != null && startsAt!.isAfter(now)) return 'Agendado';
    if (expiresAt != null && !expiresAt!.isAfter(now)) return 'Expirado';
    return 'Ativo';
  }

  factory AdminCoupon.fromJson(Map<String, dynamic> json) {
    return AdminCoupon(
      id: asString(json['id']),
      code: asString(json['code']),
      creditAmount: asInt(json['creditAmount']),
      active: json['active'] == true,
      startsAt: asDateTime(json['startsAt']),
      expiresAt: asDateTime(json['expiresAt']),
      maxRedemptions: json['maxRedemptions'] == null
          ? null
          : asInt(json['maxRedemptions']),
      maxRedemptionsPerVenue: asInt(json['maxRedemptionsPerVenue'], fallback: 1),
      redemptionCount: asInt(json['redemptionCount']),
      createdAt: asDateTime(json['createdAt']) ?? DateTime.now(),
    );
  }
}

class AdminCouponRedemption {
  const AdminCouponRedemption({
    required this.id,
    required this.venueId,
    required this.venueName,
    required this.creditAmount,
    required this.redeemedAt,
    this.city,
  });

  final String id;
  final String venueId;
  final String venueName;
  final String? city;
  final int creditAmount;
  final DateTime redeemedAt;

  factory AdminCouponRedemption.fromJson(Map<String, dynamic> json) {
    return AdminCouponRedemption(
      id: asString(json['id']),
      venueId: asString(json['venueId']),
      venueName: asString(json['venueName']),
      city: json['city']?.toString(),
      creditAmount: asInt(json['creditAmount']),
      redeemedAt: asDateTime(json['redeemedAt']) ?? DateTime.now(),
    );
  }
}

class AdminCouponDetail {
  const AdminCouponDetail({
    required this.coupon,
    required this.redemptions,
  });

  final AdminCoupon coupon;
  final List<AdminCouponRedemption> redemptions;

  factory AdminCouponDetail.fromJson(Map<String, dynamic> json) {
    final raw = json['redemptions'];
    final redemptions = <AdminCouponRedemption>[];
    if (raw is List) {
      for (final item in raw) {
        if (item is Map) {
          redemptions.add(
            AdminCouponRedemption.fromJson(Map<String, dynamic>.from(item)),
          );
        }
      }
    }
    return AdminCouponDetail(
      coupon: AdminCoupon.fromJson(json),
      redemptions: redemptions,
    );
  }
}
