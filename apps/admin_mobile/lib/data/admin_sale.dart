import 'json_util.dart';

class AdminSale {
  const AdminSale({
    required this.id,
    required this.packageKey,
    required this.credits,
    required this.amountPaid,
    required this.currency,
    required this.provider,
    required this.status,
    required this.confirmedAt,
    required this.venueId,
    required this.venueName,
    this.refundKinds = const [],
    this.refundAudits = const [],
  });

  final String id;
  final String packageKey;
  final int credits;
  final double amountPaid;
  final String currency;
  final String? provider;
  final String status;
  final DateTime? confirmedAt;
  final String venueId;
  final String venueName;
  final List<String> refundKinds;
  final List<AdminRefundAudit> refundAudits;

  bool get hasPartialReview =>
      status.toUpperCase() != 'REFUNDED' &&
      refundKinds.contains('partial_review');

  bool get hasOpenRefundReview {
    if (status.toUpperCase() != 'PAID' || !refundKinds.contains('refund_review')) {
      return false;
    }
    if (!refundKinds.contains('partial_review')) return true;
    final reviewAt = _recordedAt('refund_review');
    final partialAt = _recordedAt('partial_review');
    if (reviewAt == null || partialAt == null) return false;
    return reviewAt.isAfter(partialAt);
  }

  DateTime? _recordedAt(String kind) {
    for (final audit in refundAudits) {
      if (audit.kind == kind) return audit.recordedAt;
    }
    return null;
  }

  factory AdminSale.fromJson(Map<String, dynamic> json) {
    return AdminSale(
      id: asString(json['id']),
      packageKey: asString(json['packageKey']),
      credits: asInt(json['credits']),
      amountPaid: asMoney(json['amountPaid']),
      currency: asString(json['currency'], fallback: 'BRL'),
      provider: json['provider']?.toString(),
      status: asString(json['status']),
      confirmedAt: asDateTime(json['confirmedAt']),
      venueId: asString(json['venueId']),
      venueName: asString(json['venueName']),
      refundKinds: _strings(json['refundKinds']),
      refundAudits: _audits(json['refundAudits']),
    );
  }
}

class AdminRefundAudit {
  const AdminRefundAudit({
    required this.kind,
    required this.recordedAt,
    this.refundedAmount,
    this.creditsRecovered,
    this.creditsUnrecovered,
    this.refundId,
  });

  final String kind;
  final DateTime? recordedAt;
  final double? refundedAmount;
  final int? creditsRecovered;
  final int? creditsUnrecovered;
  final String? refundId;

  factory AdminRefundAudit.fromJson(Map<String, dynamic> json) {
    return AdminRefundAudit(
      kind: asString(json['kind']),
      recordedAt: asDateTime(json['recordedAt']),
      refundedAmount: _moneyOrNull(json['refundedAmount']),
      creditsRecovered: _intOrNull(json['creditsRecovered']),
      creditsUnrecovered: _intOrNull(json['creditsUnrecovered']),
      refundId: _textOrNull(json['refundId']),
    );
  }
}

List<String> _strings(Object? value) {
  if (value is! List) return const [];
  return value.map((item) => item.toString()).toList();
}

List<AdminRefundAudit> _audits(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map(
        (item) => AdminRefundAudit.fromJson(Map<String, dynamic>.from(item)),
      )
      .toList();
}

double? _moneyOrNull(Object? value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse('$value');
}

int? _intOrNull(Object? value) {
  if (value == null) return null;
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse('$value');
}

String? _textOrNull(Object? value) {
  if (value == null) return null;
  final text = value.toString().trim();
  return text.isEmpty ? null : text;
}

class AdminSaleVenue {
  const AdminSaleVenue({
    required this.id,
    required this.name,
    required this.city,
    required this.state,
  });

  final String id;
  final String name;
  final String city;
  final String state;

  factory AdminSaleVenue.fromJson(Map<String, dynamic> json) {
    return AdminSaleVenue(
      id: asString(json['id']),
      name: asString(json['name']),
      city: asString(json['city']),
      state: asString(json['state']),
    );
  }
}

class AdminSaleDetail {
  const AdminSaleDetail({
    required this.sale,
    required this.createdAt,
    required this.venue,
  });

  final AdminSale sale;
  final DateTime? createdAt;
  final AdminSaleVenue venue;

  factory AdminSaleDetail.fromJson(Map<String, dynamic> json) {
    return AdminSaleDetail(
      sale: AdminSale.fromJson(json),
      createdAt: asDateTime(json['createdAt']),
      venue: AdminSaleVenue.fromJson(asMap(json['venue'])),
    );
  }
}
