import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../config/api_config.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

/// GET paths that use OptionalJwtAuthGuard on the API.
/// A stale Bearer must not block anonymous access: one retry without
/// Authorization is allowed after a 401. Private routes are never retried.
bool isOptionalAuthGet(String path) {
  final normalized = _normalizeApiPath(path);
  switch (normalized) {
    case '/home/promotions':
    case '/home/venues':
    case '/venues':
    case '/venues/search':
      return true;
  }
  final reviews = RegExp(r'^/venues/([^/]+)/reviews$').firstMatch(normalized);
  if (reviews != null) {
    return !_reservedVenueSegment(reviews.group(1)!);
  }
  final detail = RegExp(r'^/venues/([^/]+)$').firstMatch(normalized);
  if (detail != null) {
    return !_reservedVenueSegment(detail.group(1)!);
  }
  return false;
}

String _normalizeApiPath(String path) {
  var value = path.trim();
  if (value.isEmpty) return '/';
  if (!value.startsWith('/')) value = '/$value';
  if (value.length > 1 && value.endsWith('/')) {
    value = value.substring(0, value.length - 1);
  }
  return value;
}

bool _reservedVenueSegment(String id) => id == 'geocode' || id == 'search';

class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  String? _token;

  /// Invoked at most as a session-invalidation hook when a request that
  /// actually sent `Authorization` receives 401. Must be idempotent.
  Future<void> Function()? onUnauthorized;

  void setToken(String? token) => _token = token;

  Map<String, String> _jsonHeaders({required bool omitAuth}) => {
        'Content-Type': 'application/json',
        if (!omitAuth && _token != null) 'Authorization': 'Bearer $_token',
      };

  Future<http.Response> _send(Future<http.Response> Function() request) async {
    try {
      return await request();
    } on http.ClientException {
      throw ApiException(
        'Não foi possível conectar à API em ${ApiConfig.baseUrl}.',
      );
    }
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path').replace(
      queryParameters: query,
    );
    return _request('GET', path, () => _client.get(uri, headers: _jsonHeaders(omitAuth: false)), () {
      return _client.get(uri, headers: _jsonHeaders(omitAuth: true));
    });
  }

  Future<dynamic> post(String path, {Object? body}) {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    final encoded = body == null ? null : jsonEncode(body);
    return _request(
      'POST',
      path,
      () => _client.post(uri, headers: _jsonHeaders(omitAuth: false), body: encoded),
      () => _client.post(uri, headers: _jsonHeaders(omitAuth: true), body: encoded),
    );
  }

  Future<dynamic> patch(String path, {Object? body}) {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    final encoded = body == null ? null : jsonEncode(body);
    return _request(
      'PATCH',
      path,
      () => _client.patch(uri, headers: _jsonHeaders(omitAuth: false), body: encoded),
      () => _client.patch(uri, headers: _jsonHeaders(omitAuth: true), body: encoded),
    );
  }

  Future<dynamic> put(String path, {Object? body}) {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    final encoded = body == null ? null : jsonEncode(body);
    return _request(
      'PUT',
      path,
      () => _client.put(uri, headers: _jsonHeaders(omitAuth: false), body: encoded),
      () => _client.put(uri, headers: _jsonHeaders(omitAuth: true), body: encoded),
    );
  }

  Future<dynamic> delete(String path) {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    return _request(
      'DELETE',
      path,
      () => _client.delete(uri, headers: _jsonHeaders(omitAuth: false)),
      () => _client.delete(uri, headers: _jsonHeaders(omitAuth: true)),
    );
  }

  /// Multipart upload to POST /uploads (field name: file).
  Future<Map<String, dynamic>> uploadImage({
    required Uint8List bytes,
    required String filename,
    String? mimeType,
  }) {
    return uploadFile(
      bytes: bytes,
      filename: filename,
      mimeType: mimeType,
    );
  }

  Future<Map<String, dynamic>> uploadFile({
    required Uint8List bytes,
    required String filename,
    String? mimeType,
  }) async {
    Future<http.Response> send({required bool omitAuth}) async {
      final uri = Uri.parse('${ApiConfig.baseUrl}/uploads');
      final request = http.MultipartRequest('POST', uri);
      if (!omitAuth && _token != null) {
        request.headers['Authorization'] = 'Bearer $_token';
      }
      request.files.add(
        http.MultipartFile.fromBytes(
          'file',
          bytes,
          filename: filename,
          contentType: _mediaTypeFor(filename, mimeType),
        ),
      );
      return http.Response.fromStream(await _client.send(request));
    }

    final body = await _request(
      'POST',
      '/uploads',
      () => send(omitAuth: false),
      () => send(omitAuth: true),
    );
    return body as Map<String, dynamic>;
  }

  Future<dynamic> _request(
    String method,
    String path,
    Future<http.Response> Function() sendAuthed,
    Future<http.Response> Function() sendAnonymous, {
    bool isRetry = false,
  }) async {
    final sentAuthorization = !isRetry && _token != null;
    final res = await _send(isRetry ? sendAnonymous : sendAuthed);
    if (res.statusCode == 401 && sentAuthorization) {
      final hook = onUnauthorized;
      if (hook != null) {
        await hook();
      }
      if (!isRetry &&
          method.toUpperCase() == 'GET' &&
          isOptionalAuthGet(path)) {
        return _request(
          method,
          path,
          sendAuthed,
          sendAnonymous,
          isRetry: true,
        );
      }
    }
    return _decode(res);
  }

  MediaType _mediaTypeFor(String filename, String? mimeType) {
    if (mimeType != null && mimeType.contains('/')) {
      try {
        return MediaType.parse(mimeType);
      } catch (_) {}
    }
    final ext = filename.split('.').last.toLowerCase();
    switch (ext) {
      case 'png':
        return MediaType('image', 'png');
      case 'gif':
        return MediaType('image', 'gif');
      case 'webp':
        return MediaType('image', 'webp');
      case 'mp4':
        return MediaType('video', 'mp4');
      case 'webm':
        return MediaType('video', 'webm');
      case 'mov':
        return MediaType('video', 'quicktime');
      case 'm4v':
        return MediaType('video', 'x-m4v');
      default:
        return MediaType('image', 'jpeg');
    }
  }

  dynamic _decode(http.Response res) {
    final body = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return body;
    }
    final message = body is Map && body['message'] != null
        ? (body['message'] is List
            ? (body['message'] as List).join(', ')
            : body['message'].toString())
        : 'Erro ${res.statusCode}';
    throw ApiException(message, statusCode: res.statusCode);
  }
}
