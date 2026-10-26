class DeletionStatus {
  DeletionStatus({
    required this.accountStatus,
    this.deletionRequestedAt,
    this.permanentDeletionAt,
    required this.remainingSeconds,
  });

  final String accountStatus;
  final DateTime? deletionRequestedAt;
  final DateTime? permanentDeletionAt;
  final int remainingSeconds;

  bool get isPending => accountStatus == 'PENDING_DELETION';

  bool get canRecover => isPending && remainingSeconds > 0;

  factory DeletionStatus.fromJson(Map<String, dynamic> json) {
    return DeletionStatus(
      accountStatus: json['accountStatus'] as String? ?? 'ACTIVE',
      deletionRequestedAt: _parseDate(json['deletionRequestedAt']),
      permanentDeletionAt: _parseDate(json['permanentDeletionAt']),
      remainingSeconds: (json['remainingSeconds'] as num?)?.toInt() ?? 0,
    );
  }

  static DateTime? _parseDate(Object? raw) {
    if (raw is! String || raw.isEmpty) return null;
    return DateTime.tryParse(raw);
  }
}

class PendingAccountRecovery {
  PendingAccountRecovery({
    required this.recoveryToken,
    required this.status,
  });

  final String recoveryToken;
  final DeletionStatus status;

  factory PendingAccountRecovery.fromLoginResponse(Map<String, dynamic> data) {
    return PendingAccountRecovery(
      recoveryToken: data['recoveryToken'] as String,
      status: DeletionStatus.fromJson(
        data['deletionStatus'] as Map<String, dynamic>,
      ),
    );
  }
}

String formatDeletionRemainingSeconds(int seconds) {
  if (seconds <= 0) return '0 minutos';
  final days = seconds ~/ 86400;
  final hours = (seconds % 86400) ~/ 3600;
  final minutes = (seconds % 3600) ~/ 60;
  if (days > 0) {
    return '$days ${days == 1 ? 'dia' : 'dias'}'
        '${hours > 0 ? ' e $hours ${hours == 1 ? 'hora' : 'horas'}' : ''}';
  }
  if (hours > 0) {
    return '$hours ${hours == 1 ? 'hora' : 'horas'}'
        '${minutes > 0 ? ' e $minutes min' : ''}';
  }
  return '$minutes ${minutes == 1 ? 'minuto' : 'minutos'}';
}
