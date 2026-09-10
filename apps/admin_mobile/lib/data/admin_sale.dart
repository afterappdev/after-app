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
    );
  }
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
