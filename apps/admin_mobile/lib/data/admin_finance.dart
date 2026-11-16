import 'json_util.dart';

enum AdminFinanceDirection { inflow, outflow }

AdminFinanceDirection adminFinanceDirectionFromApi(String? raw) {
  if (raw?.toUpperCase() == 'OUTFLOW') return AdminFinanceDirection.outflow;
  return AdminFinanceDirection.inflow;
}

extension AdminFinanceDirectionApi on AdminFinanceDirection {
  String get apiValue => this == AdminFinanceDirection.outflow ? 'OUTFLOW' : 'INFLOW';
}

enum AdminFinanceCategory {
  vendas,
  infraestrutura,
  marketing,
  outros,
}

AdminFinanceCategory adminFinanceCategoryFromApi(String? raw) {
  switch ((raw ?? '').toUpperCase()) {
    case 'INFRAESTRUTURA':
      return AdminFinanceCategory.infraestrutura;
    case 'MARKETING':
      return AdminFinanceCategory.marketing;
    case 'OUTROS':
      return AdminFinanceCategory.outros;
    default:
      return AdminFinanceCategory.vendas;
  }
}

extension AdminFinanceCategoryLabels on AdminFinanceCategory {
  String get label => switch (this) {
        AdminFinanceCategory.vendas => 'Vendas',
        AdminFinanceCategory.infraestrutura => 'Infraestrutura',
        AdminFinanceCategory.marketing => 'Marketing',
        AdminFinanceCategory.outros => 'Outros',
      };

  String get apiValue => name.toUpperCase();
}

class AdminFinanceTotals {
  const AdminFinanceTotals({
    required this.inflowBrl,
    required this.inflowCount,
    required this.outflowBrl,
    required this.outflowCount,
  });

  final double inflowBrl;
  final int inflowCount;
  final double outflowBrl;
  final int outflowCount;

  factory AdminFinanceTotals.fromJson(Map<String, dynamic> json) {
    final inflow = asMap(json['inflow']);
    final outflow = asMap(json['outflow']);
    return AdminFinanceTotals(
      inflowBrl: asMoney(inflow['totalBrl']),
      inflowCount: asInt(inflow['count']),
      outflowBrl: asMoney(outflow['totalBrl']),
      outflowCount: asInt(outflow['count']),
    );
  }
}

class AdminFinanceDailyPoint {
  const AdminFinanceDailyPoint({
    required this.date,
    required this.inflowBrl,
    required this.outflowBrl,
  });

  final String date;
  final double inflowBrl;
  final double outflowBrl;

  factory AdminFinanceDailyPoint.fromJson(Map<String, dynamic> json) {
    return AdminFinanceDailyPoint(
      date: asString(json['date']),
      inflowBrl: asMoney(json['inflowBrl']),
      outflowBrl: asMoney(json['outflowBrl']),
    );
  }
}

class AdminFinanceOverview {
  const AdminFinanceOverview({
    required this.yearMonth,
    required this.month,
    required this.monthBalanceBrl,
    required this.accumulatedBalanceBrl,
    required this.accumulatedThrough,
    required this.daily,
  });

  final String yearMonth;
  final AdminFinanceTotals month;
  final double monthBalanceBrl;
  final double accumulatedBalanceBrl;
  final DateTime? accumulatedThrough;
  final List<AdminFinanceDailyPoint> daily;

  factory AdminFinanceOverview.fromJson(Map<String, dynamic> json) {
    final dailyRaw = json['daily'];
    final daily = <AdminFinanceDailyPoint>[];
    if (dailyRaw is List) {
      for (final item in dailyRaw) {
        if (item is Map) {
          daily.add(
            AdminFinanceDailyPoint.fromJson(Map<String, dynamic>.from(item)),
          );
        }
      }
    }
    return AdminFinanceOverview(
      yearMonth: asString(json['yearMonth']),
      month: AdminFinanceTotals.fromJson(asMap(json['month'])),
      monthBalanceBrl: asMoney(json['monthBalanceBrl']),
      accumulatedBalanceBrl: asMoney(json['accumulatedBalanceBrl']),
      accumulatedThrough: asDateTime(json['accumulatedThrough']),
      daily: daily,
    );
  }
}

class AdminFinanceMovement {
  const AdminFinanceMovement({
    required this.id,
    required this.direction,
    required this.description,
    required this.amountBrl,
    required this.category,
    required this.occurredAt,
    required this.actorLabel,
    required this.source,
    this.notes,
  });

  final String id;
  final AdminFinanceDirection direction;
  final String description;
  final double amountBrl;
  final AdminFinanceCategory category;
  final DateTime? occurredAt;
  final String actorLabel;
  final String source;
  final String? notes;

  bool get isSale => source.toUpperCase() == 'SALE';

  factory AdminFinanceMovement.fromJson(Map<String, dynamic> json) {
    return AdminFinanceMovement(
      id: asString(json['id']),
      direction: adminFinanceDirectionFromApi(json['direction']?.toString()),
      description: asString(json['description']),
      amountBrl: asMoney(json['amountBrl']),
      category: adminFinanceCategoryFromApi(json['category']?.toString()),
      occurredAt: asDateTime(json['occurredAt']),
      actorLabel: asString(json['actorLabel'], fallback: 'Sistema'),
      source: asString(json['source'], fallback: 'MANUAL'),
      notes: json['notes']?.toString(),
    );
  }
}
