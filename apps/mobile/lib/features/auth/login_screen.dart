import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/after_logo.dart';
import '../public/public_chrome.dart';
import 'auth_controller.dart';
import 'social_auth.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.showPublicHomeLink = false});

  /// Web named `/login` only. Native [AppStartup] leaves this false.
  final bool showPublicHomeLink;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  static const _accent = Color(0xFFF58634);
  static const _inputFill = Color(0xFFF2F5F4);
  static const _hint = Color(0xFF8A9391);
  static const _subtitle = Color(0xFF8A9391);
  static const _inputTextStyle = TextStyle(
    fontFamily: AppTheme.fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: Color(0xFF282829),
  );

  final _email = TextEditingController();
  final _password = TextEditingController();
  final _passwordFocus = FocusNode();
  bool _loading = false;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  void _showErrorSnackBar(String message) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF1A1A1A),
        content: Text(
          message,
          style: const TextStyle(
            fontFamily: AppTheme.fontFamily,
            color: Colors.white,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }

  bool _isValidEmail(String email) {
    return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email);
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    final password = _password.text;
    if (!_isValidEmail(email) || password.length < 6) {
      _showErrorSnackBar(
        'Preencha um email válido, e a senha deverá conter no mínimo 6 caracteres.',
      );
      return;
    }

    setState(() => _loading = true);
    try {
      await context.read<AuthController>().login(
            email: email,
            password: password,
          );
    } on ApiException catch (e) {
      if (!mounted) return;
      _showErrorSnackBar(e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _socialLogin(Future<void> Function() action) async {
    if (_loading) return;
    setState(() => _loading = true);
    try {
      await action();
    } on SocialAuthCanceled {
      return;
    } on ApiException catch (e) {
      if (!mounted) return;
      _showErrorSnackBar(e.message);
    } catch (e) {
      if (!mounted) return;
      _showErrorSnackBar(
        e.toString().replaceFirst('Exception: ', ''),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  SocialAuth _socialAuth(BuildContext context) {
    return SocialAuth(
      api: context.read<ApiClient>(),
      auth: context.read<AuthController>(),
    );
  }

  InputDecoration _fieldDecoration({
    required String hint,
    required IconData icon,
    Widget? suffix,
  }) {
    return InputDecoration(
      hintText: hint,
      hintStyle: _inputTextStyle.copyWith(color: _hint),
      filled: true,
      fillColor: _inputFill,
      prefixIcon: Icon(icon, color: _accent, size: 22),
      suffixIcon: suffix,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: _accent, width: 1.4),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8F7),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (widget.showPublicHomeLink)
              const Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: EdgeInsets.fromLTRB(8, 4, 8, 0),
                  child: PublicHomeLink(),
                ),
              ),
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 24,
                  ),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 400),
                    child: _loginCard(context),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _loginCard(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(28),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.06),
                            blurRadius: 28,
                            offset: const Offset(0, 10),
                          ),
                        ],
                      ),
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(24, 32, 24, 28),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                      const AfterLogo(height: 72),
                      const SizedBox(height: 22),
                      Text(
                        'Bem-vindo(a)!',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                              fontFamily: AppTheme.fontFamily,
                              fontWeight: FontWeight.w800,
                              color: const Color(0xFF282829),
                              fontSize: 20,
                              height: 1.2,
                            ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Entre na sua conta para continuar',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          color: _subtitle,
                          fontSize: 14,
                          fontWeight: FontWeight.w400,
                        ),
                      ),
                      const SizedBox(height: 28),
                      TextField(
                        key: const Key('login-email'),
                        controller: _email,
                        style: _inputTextStyle,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.email],
                        onSubmitted: (_) => _passwordFocus.requestFocus(),
                        decoration: _fieldDecoration(
                          hint: 'Seu e-mail',
                          icon: Icons.mail_outline_rounded,
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        key: const Key('login-password'),
                        controller: _password,
                        focusNode: _passwordFocus,
                        style: _inputTextStyle,
                        obscureText: _obscurePassword,
                        textInputAction: TextInputAction.done,
                        autofillHints: const [AutofillHints.password],
                        onSubmitted: (_) => _loading ? null : _submit(),
                        decoration: _fieldDecoration(
                          hint: 'Sua senha',
                          icon: Icons.lock_outline_rounded,
                          suffix: IconButton(
                            onPressed: () => setState(
                              () => _obscurePassword = !_obscurePassword,
                            ),
                            icon: Icon(
                              _obscurePassword
                                  ? Icons.visibility_off_outlined
                                  : Icons.visibility_outlined,
                              color: _hint,
                              size: 22,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          key: const Key('forgot-password'),
                          onPressed: () {
                            Navigator.of(context).pushNamed(
                              AppRoutes.forgotPassword,
                            );
                          },
                          style: TextButton.styleFrom(
                            foregroundColor: _accent,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 4,
                              vertical: 0,
                            ),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            textStyle: const TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                          child: const Text('Esqueci minha senha'),
                        ),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        height: 52,
                        child: ElevatedButton(
                          onPressed: _loading ? null : _submit,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.black,
                            disabledBackgroundColor: Colors.black,
                            foregroundColor: Colors.white,
                            disabledForegroundColor: Colors.white70,
                            elevation: 6,
                            shadowColor: Colors.black.withValues(alpha: 0.35),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                            textStyle: const TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                            ),
                          ),
                          child: _loading
                              ? const SizedBox(
                                  height: 22,
                                  width: 22,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2.4,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text('Entrar'),
                        ),
                      ),
                      const SizedBox(height: 22),
                      const _OrDivider(),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: _SocialButton(
                              label: 'Google',
                              icon: const CustomPaint(
                                size: Size(18, 18),
                                painter: _GoogleLogoPainter(),
                              ),
                              onTap: _loading
                                  ? null
                                  : () => _socialLogin(
                                        () => _socialAuth(context)
                                            .signInWithGoogle(),
                                      ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _SocialButton(
                              label: 'Apple',
                              icon: const Icon(
                                Icons.apple,
                                size: 22,
                                color: Colors.black,
                              ),
                              onTap: _loading
                                  ? null
                                  : () => _socialLogin(
                                        () => _socialAuth(context)
                                            .signInWithApple(),
                                      ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 22),
                      Wrap(
                        alignment: WrapAlignment.center,
                        children: [
                          const Text(
                            'Não tem conta? ',
                            style: TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              color: _subtitle,
                              fontSize: 14,
                            ),
                          ),
                          GestureDetector(
                            onTap: () {
                              context
                                  .read<AuthController>()
                                  .clearPendingSocialOnboarding();
                              Navigator.of(context)
                                  .pushNamed(AppRoutes.register);
                            },
                            child: const Text(
                              'Crie aqui.',
                              style: TextStyle(
                                fontFamily: AppTheme.fontFamily,
                                color: _accent,
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _OrDivider extends StatelessWidget {
  const _OrDivider();

  @override
  Widget build(BuildContext context) {
    const line = Color(0xFFE6E6EC);
    return const Row(
      children: [
        Expanded(child: Divider(color: line, thickness: 1)),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 10),
          child: Text(
            'ou continue com',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              color: Color(0xFF9A9AA3),
              fontSize: 12,
              fontWeight: FontWeight.w400,
            ),
          ),
        ),
        Expanded(child: Divider(color: line, thickness: 1)),
      ],
    );
  }
}

class _SocialButton extends StatelessWidget {
  const _SocialButton({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final Widget icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          foregroundColor: const Color(0xFF282829),
          backgroundColor: Colors.white,
          side: const BorderSide(color: Color(0xFFE8E8EE)),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w600,
            fontSize: 14,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            icon,
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GoogleLogoPainter extends CustomPainter {
  const _GoogleLogoPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * 0.18;
    final rect = Rect.fromLTWH(
      stroke / 2,
      stroke / 2,
      size.width - stroke,
      size.height - stroke,
    );
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.square;

    paint.color = const Color(0xFF4285F4);
    canvas.drawArc(rect, -math.pi * 0.22, math.pi * 0.55, false, paint);
    paint.color = const Color(0xFF34A853);
    canvas.drawArc(rect, math.pi * 0.28, math.pi * 0.5, false, paint);
    paint.color = const Color(0xFFFBBC05);
    canvas.drawArc(rect, math.pi * 0.78, math.pi * 0.45, false, paint);
    paint.color = const Color(0xFFEA4335);
    canvas.drawArc(rect, math.pi * 1.18, math.pi * 0.5, false, paint);

    final bar = Paint()..color = const Color(0xFF4285F4);
    canvas.drawRect(
      Rect.fromLTWH(
        size.width * 0.48,
        size.height * 0.42,
        size.width * 0.42,
        stroke,
      ),
      bar,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
