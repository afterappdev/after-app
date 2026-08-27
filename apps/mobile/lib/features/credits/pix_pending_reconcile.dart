import '../../core/network/api_client.dart';

bool isPendingPixPurchase(Map<String, dynamic> purchase) {
  final provider = (purchase['provider']?.toString() ?? '').trim().toLowerCase();
  final status = (purchase['status']?.toString() ?? '').trim().toUpperCase();
  return provider == 'pix' && status == 'PENDING';
}

String? pixPurchaseId(Map<String, dynamic> purchase) {
  final id = purchase['id']?.toString().trim();
  if (id == null || id.isEmpty) return null;
  return id;
}

class PixListReconcileResult {
  const PixListReconcileResult({
    required this.purchases,
    required this.anyBecamePaid,
    required this.fetchedIds,
  });

  final List<dynamic> purchases;
  final bool anyBecamePaid;
  final List<String> fetchedIds;
}

/// One-shot GET /credits/purchases/:id for each PIX PENDING row. Sequential.
Future<PixListReconcileResult> reconcilePendingPixPurchases({
  required List<dynamic> purchases,
  required Future<Map<String, dynamic>> Function(String id) fetchById,
}) async {
  final next = List<dynamic>.from(purchases);
  final fetchedIds = <String>[];
  var anyBecamePaid = false;

  for (var i = 0; i < next.length; i++) {
    final raw = next[i];
    if (raw is! Map) continue;
    final row = Map<String, dynamic>.from(raw);
    if (!isPendingPixPurchase(row)) continue;
    final id = pixPurchaseId(row);
    if (id == null) continue;

    fetchedIds.add(id);
    try {
      final updated = await fetchById(id);
      final merged = {...row, ...updated};
      next[i] = merged;
      final status = (merged['status']?.toString() ?? '').toUpperCase();
      if (status == 'PAID') anyBecamePaid = true;
    } on ApiException catch (error) {
      if (error.statusCode == 401) rethrow;
    }
  }

  return PixListReconcileResult(
    purchases: next,
    anyBecamePaid: anyBecamePaid,
    fetchedIds: fetchedIds,
  );
}
