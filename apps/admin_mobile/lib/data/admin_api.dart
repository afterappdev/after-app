import '../core/network/api_client.dart';
import 'admin_account.dart';
import 'admin_dashboard.dart';
import 'admin_report.dart';
import 'admin_sale.dart';
import 'admin_session.dart';
import 'paginated.dart';

abstract class AdminApi {
  Future<AdminLoginResult> login({
    required String email,
    required String password,
  });

  Future<AdminMe> me();

  Future<AdminDashboard> dashboard();

  Future<Paginated<AdminAccount>> accounts({
    int page = 1,
    int limit = 20,
    String? role,
    String? query,
  });

  Future<AdminAccountDetail> account(String id);

  Future<void> deleteAccount(String id);

  Future<Paginated<AdminSale>> sales({
    int page = 1,
    int limit = 20,
    String? provider,
    String? from,
    String? to,
  });

  Future<AdminSaleDetail> sale(String id);

  Future<void> registerPushToken({
    required String token,
    required String platform,
  });

  Future<void> unregisterPushToken(String token);

  Future<Paginated<AdminReport>> reports({
    int page = 1,
    int limit = 20,
    String? status,
    String? targetType,
  });

  Future<AdminReportDetail> report(String id);

  Future<AdminReportDetail> moderateReport(
    String id, {
    required String status,
    String? adminNote,
    bool removeContent = false,
  });

  Future<AdminReportDetail> restoreVenue(String id);
}

class HttpAdminApi implements AdminApi {
  HttpAdminApi(this.client);

  final ApiClient client;

  @override
  Future<AdminLoginResult> login({
    required String email,
    required String password,
  }) async {
    final data = await client.post(
      '/admin/auth/login',
      body: {'email': email, 'password': password},
      notifyUnauthorized: false,
    );
    return AdminLoginResult.fromJson(Map<String, dynamic>.from(data as Map));
  }

  @override
  Future<AdminMe> me() async {
    final data = await client.get('/admin/me');
    return AdminMe.fromJson(Map<String, dynamic>.from(data as Map));
  }

  @override
  Future<AdminDashboard> dashboard() async {
    final data = await client.get('/admin/dashboard');
    return AdminDashboard.fromJson(Map<String, dynamic>.from(data as Map));
  }

  @override
  Future<Paginated<AdminAccount>> accounts({
    int page = 1,
    int limit = 20,
    String? role,
    String? query,
  }) async {
    final data = await client.get(
      '/admin/accounts',
      query: {
        'page': '$page',
        'limit': '$limit',
        if (role != null && role.isNotEmpty) 'role': role,
        if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
      },
    );
    return Paginated.fromJson(
      Map<String, dynamic>.from(data as Map),
      AdminAccount.fromJson,
    );
  }

  @override
  Future<AdminAccountDetail> account(String id) async {
    final data = await client.get('/admin/accounts/$id');
    return AdminAccountDetail.fromJson(Map<String, dynamic>.from(data as Map));
  }

  @override
  Future<void> deleteAccount(String id) async {
    await client.delete('/admin/accounts/$id');
  }

  @override
  Future<Paginated<AdminSale>> sales({
    int page = 1,
    int limit = 20,
    String? provider,
    String? from,
    String? to,
  }) async {
    final data = await client.get(
      '/admin/sales',
      query: {
        'page': '$page',
        'limit': '$limit',
        if (provider != null && provider.isNotEmpty) 'provider': provider,
        if (from != null && from.isNotEmpty) 'from': from,
        if (to != null && to.isNotEmpty) 'to': to,
      },
    );
    return Paginated.fromJson(
      Map<String, dynamic>.from(data as Map),
      AdminSale.fromJson,
    );
  }

  @override
  Future<AdminSaleDetail> sale(String id) async {
    final data = await client.get('/admin/sales/$id');
    return AdminSaleDetail.fromJson(Map<String, dynamic>.from(data as Map));
  }

  @override
  Future<void> registerPushToken({
    required String token,
    required String platform,
  }) async {
    await client.post(
      '/admin/push-tokens',
      body: {'token': token, 'platform': platform},
    );
  }

  @override
  Future<void> unregisterPushToken(String token) async {
    await client.delete(
      '/admin/push-tokens',
      body: {'token': token},
      notifyUnauthorized: false,
    );
  }

  @override
  Future<Paginated<AdminReport>> reports({
    int page = 1,
    int limit = 20,
    String? status,
    String? targetType,
  }) async {
    final data = await client.get(
      '/admin/reports',
      query: {
        'page': '$page',
        'limit': '$limit',
        if (status != null && status.isNotEmpty) 'status': status,
        if (targetType != null && targetType.isNotEmpty) 'targetType': targetType,
      },
    );
    return Paginated.fromJson(
      Map<String, dynamic>.from(data as Map),
      AdminReport.fromJson,
    );
  }

  @override
  Future<AdminReportDetail> report(String id) async {
    final data = await client.get('/admin/reports/$id');
    return AdminReportDetail.fromJson(Map<String, dynamic>.from(data as Map));
  }

  @override
  Future<AdminReportDetail> moderateReport(
    String id, {
    required String status,
    String? adminNote,
    bool removeContent = false,
  }) async {
    final data = await client.patch(
      '/admin/reports/$id',
      body: {
        'status': status,
        if (adminNote != null && adminNote.trim().isNotEmpty)
          'adminNote': adminNote.trim(),
        if (removeContent) 'removeContent': true,
      },
    );
    return AdminReportDetail.fromJson(Map<String, dynamic>.from(data as Map));
  }

  @override
  Future<AdminReportDetail> restoreVenue(String id) async {
    final data = await client.post('/admin/reports/$id/restore-venue');
    return AdminReportDetail.fromJson(Map<String, dynamic>.from(data as Map));
  }
}
