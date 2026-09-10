import 'json_util.dart';

class AdminMe {
  const AdminMe({required this.id, required this.email, required this.role});

  final String id;
  final String email;
  final String role;

  factory AdminMe.fromJson(Map<String, dynamic> json) {
    return AdminMe(
      id: asString(json['id']),
      email: asString(json['email']),
      role: asString(json['role']),
    );
  }
}

class AdminLoginResult {
  const AdminLoginResult({required this.accessToken, required this.user});

  final String accessToken;
  final AdminMe user;

  factory AdminLoginResult.fromJson(Map<String, dynamic> json) {
    final userJson = asMap(json['user']);
    return AdminLoginResult(
      accessToken: asString(json['accessToken']),
      user: AdminMe(
        id: asString(userJson['id']),
        email: asString(userJson['email']),
        role: asString(userJson['role']),
      ),
    );
  }
}
