enum PushNavKind { account, sale }

class PushNavTarget {
  const PushNavTarget({required this.kind, required this.id});

  final PushNavKind kind;
  final String id;
}

class AdminPushMessage {
  const AdminPushMessage({this.title, this.body, this.target});

  final String? title;
  final String? body;
  final PushNavTarget? target;
}

PushNavTarget? parseAdminPushData(Map<String, dynamic>? data) {
  if (data == null || data.isEmpty) return null;
  final type = data['type']?.toString().trim();
  final entityId = data['entityId']?.toString().trim();
  final accountId = data['accountId']?.toString().trim();
  if (type == null || type.isEmpty) return null;

  switch (type) {
    case 'ACCOUNT_CREATED':
      if (entityId == null || entityId.isEmpty) return null;
      return PushNavTarget(kind: PushNavKind.account, id: entityId);
    case 'VENUE_CREATED':
      final id = (accountId != null && accountId.isNotEmpty)
          ? accountId
          : entityId;
      if (id == null || id.isEmpty) return null;
      return PushNavTarget(kind: PushNavKind.account, id: id);
    case 'PURCHASE_PAID':
      if (entityId == null || entityId.isEmpty) return null;
      return PushNavTarget(kind: PushNavKind.sale, id: entityId);
    default:
      return null;
  }
}

AdminPushMessage parseAdminPushMessage({
  String? title,
  String? body,
  Map<String, dynamic>? data,
}) {
  return AdminPushMessage(
    title: title,
    body: body,
    target: parseAdminPushData(data),
  );
}
