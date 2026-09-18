import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import 'auth_controller.dart';

class AppleWebCallbackPage extends StatefulWidget {
  const AppleWebCallbackPage({
    super.key,
    this.code,
    this.status,
  });

  final String? code;
  final String? status;

  @override
  State<AppleWebCallbackPage> createState() => _AppleWebCallbackPageState();
}

class _AppleWebCallbackPageState extends State<AppleWebCallbackPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _complete();
    });
  }

  Future<void> _complete() async {
    if (!mounted) return;
    final status = widget.status?.trim();
    if (status == 'canceled' || status == 'error') {
      _goLogin(status ?? 'error');
      return;
    }
    final code = widget.code?.trim();
    if (code == null || code.isEmpty) {
      _goLogin('error');
      return;
    }
    try {
      await context.read<AuthController>().exchangeAppleWebLogin(code);
      if (!mounted) return;
      final auth = context.read<AuthController>();
      if (auth.user != null) {
        Navigator.of(context).pushReplacementNamed(AppRoutes.home);
        return;
      }
      if (auth.pendingSocialOnboarding != null) {
        Navigator.of(context).pushReplacementNamed(AppRoutes.register);
        return;
      }
      _goLogin('error');
    } on ApiException {
      if (!mounted) return;
      _goLogin('error');
    } catch (_) {
      if (!mounted) return;
      _goLogin('error');
    }
  }

  void _goLogin(String status) {
    Navigator.of(context).pushReplacementNamed(
      '${AppRoutes.login}?apple=$status',
    );
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppTheme.canvas,
      body: Center(
        child: CircularProgressIndicator(),
      ),
    );
  }
}
