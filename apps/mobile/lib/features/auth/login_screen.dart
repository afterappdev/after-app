import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../../core/network/api_client.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/after_logo.dart';
import '../public/public_chrome.dart';
import 'auth_controller.dart';
import 'social_auth.dart';

/// Botão Apple na tela de login.
///
/// iOS nativo usa o botão oficial. Android nativo omite o botão.
/// Web e os demais alvos mantêm o botão customizado já existente.
enum AppleLoginButtonKind { official, custom, hidden }

@visibleForTesting
AppleLoginButtonKind appleLoginButtonKind({
  required bool isWeb,
  required TargetPlatform platform,
}) {
  if (!isWeb && platform == TargetPlatform.iOS) {
    return AppleLoginButtonKind.official;
  }
  if (!isWeb && platform == TargetPlatform.android) {
    return AppleLoginButtonKind.hidden;
  }
  return AppleLoginButtonKind.custom;
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    this.showPublicHomeLink = false,
    this.appleWebStatus,
    this.oauthError,
    this.socialAuthFactory,
  });

  /// Web named `/login` only. Native [AppStartup] leaves this false.
  final bool showPublicHomeLink;
  final String? appleWebStatus;
  final String? oauthError;
  final SocialAuth Function(ApiClient api, AuthController auth)?
      socialAuthFactory;

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
  AuthController? _auth;

  @override
  void initState() {
    super.initState();
    final status = widget.appleWebStatus?.trim();
    final oauthError = widget.oauthError?.trim();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (status == 'canceled') {
        _showErrorSnackBar('Login com Apple cancelado.');
      } else if (status != null && status.isNotEmpty) {
        _showErrorSnackBar('Não foi possível concluir o login com Apple.');
      }
      if (oauthError != null && oauthError.isNotEmpty) {
        _showErrorSnackBar(oauthError);
      }
      _flushOAuthError();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final auth = context.read<AuthController>();
    if (!identical(_auth, auth)) {
      _auth?.removeListener(_flushOAuthError);
      _auth = auth;
      _auth!.addListener(_flushOAuthError);
    }
  }

  @override
  void dispose() {
    _auth?.removeListener(_flushOAuthError);
    _email.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  void _flushOAuthError() {
    if (!mounted) return;
    final message = _auth?.takeOAuthError();
    if (message == null || message.isEmpty) return;
    _showErrorSnackBar(message);
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
    } catch (e) {
      if (!mounted) return;
      _showErrorSnackBar(
        e.toString().replaceFirst('Exception: ', ''),
      );
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
    final api = context.read<ApiClient>();
    final auth = context.read<AuthController>();
    final factory = widget.socialAuthFactory;
    if (factory != null) return factory(api, auth);
    return SocialAuth(api: api, auth: auth);
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
    final appleButton = appleLoginButtonKind(
      isWeb: kIsWeb,
      platform: defaultTargetPlatform,
    );
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
                      if (appleButton == AppleLoginButtonKind.official)
                        _IosSocialLogins(
                          loading: _loading,
                          onGoogle: () => _socialLogin(
                            () => _socialAuth(context).signInWithGoogle(),
                          ),
                          onApple: () => _socialLogin(
                            () => _socialAuth(context).signInWithApple(),
                          ),
                        )
                      else if (appleButton == AppleLoginButtonKind.hidden)
                        _SocialButton(
                          label: 'Google',
                          icon: const SizedBox(
                            key: Key('google-logo'),
                            width: 20,
                            height: 20,
                            child: CustomPaint(
                              painter: _GoogleLogoPainter(),
                              child: SizedBox.expand(),
                            ),
                          ),
                          onTap: _loading
                              ? null
                              : () => _socialLogin(
                                    () => _socialAuth(context)
                                        .signInWithGoogle(),
                                  ),
                        )
                      else
                        Row(
                          children: [
                            Expanded(
                              child: _SocialButton(
                                label: 'Google',
                                icon: const SizedBox(
                                  key: Key('google-logo'),
                                  width: 20,
                                  height: 20,
                                  child: CustomPaint(
                                    painter: _GoogleLogoPainter(),
                                    child: SizedBox.expand(),
                                  ),
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

class _IosSocialLogins extends StatelessWidget {
  const _IosSocialLogins({
    required this.loading,
    required this.onGoogle,
    required this.onApple,
  });

  final bool loading;
  final VoidCallback onGoogle;
  final VoidCallback onApple;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _SocialButton(
          label: 'Google',
          icon: const SizedBox(
            key: Key('google-logo'),
            width: 20,
            height: 20,
            child: CustomPaint(
              painter: _GoogleLogoPainter(),
              child: SizedBox.expand(),
            ),
          ),
          onTap: loading ? null : onGoogle,
        ),
        const SizedBox(height: 12),
        SignInWithAppleButton(
          key: const Key('sign-in-with-apple'),
          onPressed: () {
            if (loading) return;
            onApple();
          },
          height: 44,
          borderRadius: const BorderRadius.all(Radius.circular(8)),
          style: SignInWithAppleButtonStyle.black,
        ),
      ],
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

  static final List<({Color color, Path path})> _parts = [
    (
      color: const Color(0xFFEA4335),
      path: _parseSvgPath(
        'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z',
      ),
    ),
    (
      color: const Color(0xFF4285F4),
      path: _parseSvgPath(
        'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z',
      ),
    ),
    (
      color: const Color(0xFFFBBC05),
      path: _parseSvgPath(
        'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z',
      ),
    ),
    (
      color: const Color(0xFF34A853),
      path: _parseSvgPath(
        'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z',
      ),
    ),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final side = math.min(size.width, size.height);
    if (side <= 0) return;
    canvas.save();
    canvas.translate((size.width - side) / 2, (size.height - side) / 2);
    canvas.scale(side / 48, side / 48);
    for (final part in _parts) {
      canvas.drawPath(part.path, Paint()..color = part.color);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

@visibleForTesting
Rect debugGoogleLogoBounds() {
  var bounds = Rect.zero;
  var first = true;
  for (final part in _GoogleLogoPainter._parts) {
    final next = part.path.getBounds();
    bounds = first ? next : bounds.expandToInclude(next);
    first = false;
  }
  return bounds;
}

Path _parseSvgPath(String source) {
  final path = Path();
  final tokens = RegExp(r'[MmLlHhVvCcSsZz]|-?\d*\.?\d+')
      .allMatches(source)
      .map((match) => match.group(0)!)
      .toList();
  var i = 0;
  String? command;
  double cx = 0;
  double cy = 0;
  double sx = 0;
  double sy = 0;
  double? prevX;
  double? prevY;

  bool isCommand(String token) => RegExp(r'^[A-Za-z]$').hasMatch(token);

  double take() {
    if (i >= tokens.length || isCommand(tokens[i])) {
      throw FormatException('Logo Google inválido');
    }
    return double.parse(tokens[i++]);
  }

  while (i < tokens.length) {
    if (isCommand(tokens[i])) {
      command = tokens[i];
      i++;
    }
    switch (command) {
      case 'M':
        cx = take();
        cy = take();
        path.moveTo(cx, cy);
        sx = cx;
        sy = cy;
        command = 'L';
        prevX = null;
        prevY = null;
        break;
      case 'L':
        cx = take();
        cy = take();
        path.lineTo(cx, cy);
        prevX = null;
        prevY = null;
        break;
      case 'l':
        cx += take();
        cy += take();
        path.lineTo(cx, cy);
        prevX = null;
        prevY = null;
        break;
      case 'H':
        cx = take();
        path.lineTo(cx, cy);
        prevX = null;
        prevY = null;
        break;
      case 'h':
        cx += take();
        path.lineTo(cx, cy);
        prevX = null;
        prevY = null;
        break;
      case 'V':
        cy = take();
        path.lineTo(cx, cy);
        prevX = null;
        prevY = null;
        break;
      case 'v':
        cy += take();
        path.lineTo(cx, cy);
        prevX = null;
        prevY = null;
        break;
      case 'C':
        final x1 = take();
        final y1 = take();
        final x2 = take();
        final y2 = take();
        final x = take();
        final y = take();
        path.cubicTo(x1, y1, x2, y2, x, y);
        prevX = x2;
        prevY = y2;
        cx = x;
        cy = y;
        break;
      case 'c':
        final x1 = cx + take();
        final y1 = cy + take();
        final x2 = cx + take();
        final y2 = cy + take();
        final x = cx + take();
        final y = cy + take();
        path.cubicTo(x1, y1, x2, y2, x, y);
        prevX = x2;
        prevY = y2;
        cx = x;
        cy = y;
        break;
      case 's':
        final x2 = cx + take();
        final y2 = cy + take();
        final x = cx + take();
        final y = cy + take();
        final x1 = prevX == null ? cx : 2 * cx - prevX;
        final y1 = prevY == null ? cy : 2 * cy - prevY;
        path.cubicTo(x1, y1, x2, y2, x, y);
        prevX = x2;
        prevY = y2;
        cx = x;
        cy = y;
        break;
      case 'Z':
      case 'z':
        path.close();
        cx = sx;
        cy = sy;
        prevX = null;
        prevY = null;
        command = null;
        break;
      default:
        throw FormatException('Logo Google inválido');
    }
  }
  return path;
}
