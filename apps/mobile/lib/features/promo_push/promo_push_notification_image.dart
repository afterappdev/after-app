import 'dart:typed_data';

import 'package:http/http.dart' as http;

const _maxPushImageBytes = 512 * 1024;
const _imageFetchTimeout = Duration(seconds: 5);

/// Downloads a small HTTPS image for an expanded local notification (foreground).
/// Returns null on any failure so the text notification still shows.
Future<Uint8List?> fetchPromoPushNotificationImage(String url) async {
  final trimmed = url.trim();
  if (trimmed.isEmpty || !trimmed.startsWith('https://')) return null;
  try {
    final uri = Uri.parse(trimmed);
    if (uri.scheme != 'https') return null;
    final response = await http
        .get(uri)
        .timeout(_imageFetchTimeout);
    if (response.statusCode != 200) return null;
    final type = response.headers['content-type']?.toLowerCase() ?? '';
    if (type.isNotEmpty && !type.startsWith('image/')) return null;
    final bytes = response.bodyBytes;
    if (bytes.isEmpty || bytes.length > _maxPushImageBytes) return null;
    return Uint8List.fromList(bytes);
  } catch (_) {
    return null;
  }
}
