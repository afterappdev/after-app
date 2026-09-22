import 'json_util.dart';

class AdminReport {
  const AdminReport({
    required this.id,
    required this.targetType,
    required this.targetId,
    required this.reason,
    required this.status,
    required this.createdAt,
    this.description,
    this.targetSnapshot = const {},
    this.moderationAction = 'NONE',
    this.reporterName,
    this.reporterId,
  });

  final String id;
  final String targetType;
  final String targetId;
  final String reason;
  final String status;
  final DateTime? createdAt;
  final String? description;
  final Map<String, dynamic> targetSnapshot;
  final String moderationAction;
  final String? reporterName;
  final String? reporterId;

  factory AdminReport.fromJson(Map<String, dynamic> json) {
    final reporter = asMap(json['reporter']);
    return AdminReport(
      id: asString(json['id']),
      targetType: asString(json['targetType']),
      targetId: asString(json['targetId']),
      reason: asString(json['reason']),
      status: asString(json['status']),
      createdAt: asDateTime(json['createdAt']),
      description: json['description']?.toString(),
      targetSnapshot: asMap(json['targetSnapshot']),
      moderationAction: asString(json['moderationAction'], fallback: 'NONE'),
      reporterId: reporter['id']?.toString(),
      reporterName: reporter['name']?.toString(),
    );
  }

  String get targetLabel {
    final name = targetSnapshot['name']?.toString() ??
        targetSnapshot['venueName']?.toString() ??
        targetSnapshot['title']?.toString();
    if (name != null && name.trim().isNotEmpty) return name.trim();
    return targetId;
  }
}

class AdminReportDetail extends AdminReport {
  const AdminReportDetail({
    required super.id,
    required super.targetType,
    required super.targetId,
    required super.reason,
    required super.status,
    required super.createdAt,
    super.description,
    super.targetSnapshot,
    super.moderationAction,
    super.reporterName,
    super.reporterId,
    this.adminNote,
    this.resolvedAt,
    this.reviewedById,
    this.reviewedByName,
    this.updatedAt,
    this.contentRestoredAt,
    this.contentRestoredById,
    this.contentRestoredByName,
    this.venueHidden = false,
  });

  final String? adminNote;
  final DateTime? resolvedAt;
  final String? reviewedById;
  final String? reviewedByName;
  final DateTime? updatedAt;
  final DateTime? contentRestoredAt;
  final String? contentRestoredById;
  final String? contentRestoredByName;
  final bool venueHidden;

  factory AdminReportDetail.fromJson(Map<String, dynamic> json) {
    final base = AdminReport.fromJson(json);
    final reviewedBy = asMap(json['reviewedBy']);
    final restoredBy = asMap(json['contentRestoredBy']);
    return AdminReportDetail(
      id: base.id,
      targetType: base.targetType,
      targetId: base.targetId,
      reason: base.reason,
      status: base.status,
      createdAt: base.createdAt,
      description: base.description,
      targetSnapshot: base.targetSnapshot,
      moderationAction: base.moderationAction,
      reporterName: base.reporterName,
      reporterId: base.reporterId,
      adminNote: json['adminNote']?.toString(),
      resolvedAt: asDateTime(json['resolvedAt']),
      reviewedById: reviewedBy['id']?.toString(),
      reviewedByName: reviewedBy['name']?.toString(),
      updatedAt: asDateTime(json['updatedAt']),
      contentRestoredAt: asDateTime(json['contentRestoredAt']),
      contentRestoredById: restoredBy['id']?.toString(),
      contentRestoredByName: restoredBy['name']?.toString(),
      venueHidden: json['venueHidden'] == true,
    );
  }
}
