import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({
    http.Client? client,
    this._baseUrl,
    this.timeout = const Duration(seconds: 20),
    this.onUnauthorized,
  }) : _client = client ?? http.Client();

  final http.Client _client;
  final String? _baseUrl;
  final Duration timeout;
  void Function()? onUnauthorized;
  String? _token;

  String get baseUrl => _baseUrl ?? ApiConfig.baseUrl;

  void setToken(String? token) => _token = token;

  Map<String, String> get _jsonHeaders => {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  Future<dynamic> get(
    String path, {
    Map<String, String>? query,
    bool notifyUnauthorized = true,
  }) {
    final uri = Uri.parse(
      '$baseUrl$path',
    ).replace(queryParameters: query == null || query.isEmpty ? null : query);
    return _send(
      () => _client.get(uri, headers: _jsonHeaders),
      notifyUnauthorized,
    );
  }

  Future<dynamic> post(
    String path, {
    Object? body,
    bool notifyUnauthorized = true,
  }) {
    final uri = Uri.parse('$baseUrl$path');
    return _send(
      () => _client.post(
        uri,
        headers: _jsonHeaders,
        body: body == null ? null : jsonEncode(body),
      ),
      notifyUnauthorized,
    );
  }

  Future<dynamic> patch(
    String path, {
    Object? body,
    bool notifyUnauthorized = true,
  }) {
    final uri = Uri.parse('$baseUrl$path');
    return _send(
      () => _client.patch(
        uri,
        headers: _jsonHeaders,
        body: body == null ? null : jsonEncode(body),
      ),
      notifyUnauthorized,
    );
  }

  Future<dynamic> delete(
    String path, {
    Object? body,
    bool notifyUnauthorized = true,
  }) {
    final uri = Uri.parse('$baseUrl$path');
    return _send(() async {
      final request = http.Request('DELETE', uri);
      request.headers.addAll(_jsonHeaders);
      if (body != null) {
        request.body = jsonEncode(body);
      }
      final streamed = await _client.send(request);
      return http.Response.fromStream(streamed);
    }, notifyUnauthorized);
  }

  Future<dynamic> _send(
    Future<http.Response> Function() request,
    bool notifyUnauthorized,
  ) async {
    try {
      final res = await request().timeout(timeout);
      return _decode(res, notifyUnauthorized);
    } on TimeoutException {
      throw ApiException('Tempo esgotado. Tente novamente.');
    } on http.ClientException {
      throw ApiException('Sem conexão com a internet.');
    } on FormatException {
      throw ApiException('Resposta inválida do servidor.');
    } on ApiException {
      rethrow;
    } catch (_) {
      throw ApiException('Não foi possível concluir a solicitação.');
    }
  }

  dynamic _decode(http.Response res, bool notifyUnauthorized) {
    final body = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return body;
    }
    if (res.statusCode == 401 && notifyUnauthorized) {
      onUnauthorized?.call();
    }
    throw ApiException(
      _friendlyMessage(res.statusCode, body),
      statusCode: res.statusCode,
    );
  }

  String _friendlyMessage(int status, Object? body) {
    final fromApi = _apiMessage(body);
    if (status == 401) {
      return fromApi.isNotEmpty ? fromApi : 'Sessão expirada. Entre novamente.';
    }
    if (status == 403) {
      return 'Sem permissão para acessar o painel.';
    }
    if (status == 404) {
      return fromApi.isNotEmpty ? fromApi : 'Registro não encontrado.';
    }
    if (status >= 500) {
      return 'Servidor indisponível. Tente novamente em instantes.';
    }
    return fromApi.isNotEmpty ? fromApi : 'Erro $status';
  }

  String _apiMessage(Object? body) {
    if (body is! Map) return '';
    final message = body['message'];
    if (message is List) {
      return message.map((item) => item.toString()).join(', ');
    }
    if (message != null) return message.toString();
    return '';
  }
}
