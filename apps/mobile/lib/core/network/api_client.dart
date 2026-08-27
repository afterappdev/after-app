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

class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  String? _token;

  void setToken(String? token) => _token = token;

  Map<String, String> get _jsonHeaders => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  Future<dynamic> get(String path, {Map<String, String>? query}) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path').replace(
      queryParameters: query,
    );
    final res = await _client.get(uri, headers: _jsonHeaders);
    return _decode(res);
  }

  Future<dynamic> post(String path, {Object? body}) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    final res = await _client.post(
      uri,
      headers: _jsonHeaders,
      body: body == null ? null : jsonEncode(body),
    );
    return _decode(res);
  }

  Future<dynamic> patch(String path, {Object? body}) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    final res = await _client.patch(
      uri,
      headers: _jsonHeaders,
      body: body == null ? null : jsonEncode(body),
    );
    return _decode(res);
  }

  Future<dynamic> put(String path, {Object? body}) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    final res = await _client.put(
      uri,
      headers: _jsonHeaders,
      body: body == null ? null : jsonEncode(body),
    );
    return _decode(res);
  }

  Future<dynamic> delete(String path) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    final res = await _client.delete(uri, headers: _jsonHeaders);
    return _decode(res);
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
    final uri = Uri.parse('${ApiConfig.baseUrl}/uploads');
    final request = http.MultipartRequest('POST', uri);
    if (_token != null) {
      request.headers['Authorization'] = 'Bearer $_token';
    }

    final mediaType = _mediaTypeFor(filename, mimeType);

    request.files.add(
      http.MultipartFile.fromBytes(
        'file',
        bytes,
        filename: filename,
        contentType: mediaType,
      ),
    );

    final streamed = await _client.send(request);
    final res = await http.Response.fromStream(streamed);
    return _decode(res) as Map<String, dynamic>;
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
