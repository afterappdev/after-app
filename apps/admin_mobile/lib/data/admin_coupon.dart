import 'json_util.dart';

enum AdminCouponKind { creditGrant, purchaseDiscount }

AdminCouponKind adminCouponKindFromApi(String? raw) {
  if (raw?.toUpperCase() == 'PURCHASE_DISCOUNT') {
    return AdminCouponKind.purchaseDiscount;
  }
  return AdminCouponKind.creditGrant;
}

enum AdminCouponCreditKind { common, vip }

AdminCouponCreditKind adminCouponCreditKindFromApi(String? raw) {
  if (raw?.toUpperCase() == 'VIP') return AdminCouponCreditKind.vip;
  return AdminCouponCreditKind.common;
}

extension AdminCouponCreditKindLabels on AdminCouponCreditKind {
  String get label => this == AdminCouponCreditKind.vip ? 'VIP' : 'Comum';

  String get apiValue => this == AdminCouponCreditKind.vip ? 'VIP' : 'COMMON';
}

enum AdminPurchaseDiscountType { percent, fixedBrl }

AdminPurchaseDiscountType adminPurchaseDiscountTypeFromApi(String? raw) {
  if (raw?.toUpperCase() == 'FIXED_BRL') {
    return AdminPurchaseDiscountType.fixedBrl;
  }
  return AdminPurchaseDiscountType.percent;
}

extension AdminPurchaseDiscountTypeLabels on AdminPurchaseDiscountType {
  String get apiValue =>
      this == AdminPurchaseDiscountType.fixedBrl ? 'FIXED_BRL' : 'PERCENT';
}

class AdminCoupon {
  const AdminCoupon({
    required this.id,
    required this.code,
    required this.kind,
    this.creditAmount,
    this.creditKind = AdminCouponCreditKind.common,
    this.discountType,
    this.discountPercent,
    this.discountAmountBrl,
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
  final AdminCouponKind kind;
  final int? creditAmount;
  final AdminCouponCreditKind creditKind;
  final AdminPurchaseDiscountType? discountType;
  final int? discountPercent;
  final double? discountAmountBrl;
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
      kind: adminCouponKindFromApi(json['kind']?.toString()),
      creditAmount: json['creditAmount'] == null
          ? null
          : asInt(json['creditAmount']),
      creditKind: adminCouponCreditKindFromApi(json['creditKind']?.toString()),
      discountType: json['discountType'] == null
          ? null
          : adminPurchaseDiscountTypeFromApi(json['discountType']?.toString()),
      discountPercent: json['discountPercent'] == null
          ? null
          : asInt(json['discountPercent']),
      discountAmountBrl: json['discountAmountBrl'] == null
          ? null
          : asMoney(json['discountAmountBrl']),
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
    this.creditAmount,
    this.creditKind = AdminCouponCreditKind.common,
    this.discountAmountBrl,
    required this.redeemedAt,
    this.city,
    this.purchaseId,
  });

  final String id;
  final String venueId;
  final String venueName;
  final String? city;
  final int? creditAmount;
  final AdminCouponCreditKind creditKind;
  final double? discountAmountBrl;
  final String? purchaseId;
  final DateTime redeemedAt;

  factory AdminCouponRedemption.fromJson(Map<String, dynamic> json) {
    return AdminCouponRedemption(
      id: asString(json['id']),
      venueId: asString(json['venueId']),
      venueName: asString(json['venueName']),
      city: json['city']?.toString(),
      creditAmount: json['creditAmount'] == null
          ? null
          : asInt(json['creditAmount']),
      creditKind: adminCouponCreditKindFromApi(json['creditKind']?.toString()),
      discountAmountBrl: json['discountAmountBrl'] == null
          ? null
          : asMoney(json['discountAmountBrl']),
      purchaseId: json['purchaseId']?.toString(),
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