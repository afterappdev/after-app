import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../public/public_chrome.dart';
import 'password_reset_uri.dart';

const _genericRequestMessage =
    'Se existir uma conta elegível com esse e-mail, enviaremos instruções para redefinir a senha.';

class ForgotPasswordPage extends StatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  State<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends State<ForgotPasswordPage> {
  final _email = TextEditingController();
  bool _loading = false;
  String? _feedback;
  bool _feedbackError = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  bool _isValidEmail(String email) {
    return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email);
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    if (!_isValidEmail(email)) {
      setState(() {
        _feedbackError = true;
        _feedback = 'Informe um e-mail válido.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _feedback = null;
      _feedbackError = false;
    });

    try {
      await context.read<ApiClient>().post(
        '/auth/password-reset/request',
        body: {'email': email},
      );
      if (!mounted) return;
      setState(() {
        _feedbackError = false;
        _feedback = _genericRequestMessage;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _feedbackError = true;
        _feedback = e.statusCode == 400
            ? 'Informe um e-mail válido.'
            : 'Não foi possível enviar as instruções agora. Tente novamente mais tarde.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _feedbackError = true;
        _feedback =
            'Não foi possível enviar as instruções agora. Tente novamente mais tarde.';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PublicPageFrame(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Esqueci minha senha',
            key: Key('forgot-page-title'),
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w800,
              fontSize: 28,
              color: AppTheme.ink,
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Informe o e-mail da conta. Se existir uma conta elegível, enviaremos um link para redefinir a senha. Abrir o e-mail não altera nada.',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w400,
              fontSize: 15,
              height: 1.5,
              color: Color(0xFF4A524F),
            ),
          ),
          const SizedBox(height: 24),
          TextField(
            key: const Key('forgot-email'),
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            enabled: !_loading,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 15,
              color: AppTheme.ink,
            ),
            decoration: InputDecoration(
              hintText: 'E-mail da conta',
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('forgot-submit'),
            onPressed: _loading ? null : _submit,
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.ink,
              foregroundColor: Colors.white,
              minimumSize: const Size(0, 48),
            ),
            child: _loading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      color: Colors.white,
                    ),
                  )
                : const Text('Enviar instruções'),
          ),
          if (_feedback != null) ...[
            const SizedBox(height: 16),
            Text(
              key: const Key('forgot-feedback'),
              _feedback!,
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w600,
                fontSize: 14,
                height: 1.4,
                color: _feedbackError ? const Color(0xFFE53935) : AppTheme.ink,
              ),
            ),
          ],
          const SizedBox(height: 20),
          TextButton(
            onPressed: () {
              Navigator.of(context).pushNamed(AppRoutes.login);
            },
            child: const Text('Voltar para o login'),
          ),
        ],
      ),
    );
  }
}

class ResetPasswordPage extends StatefulWidget {
  const ResetPasswordPage({super.key, this.token});

  final String? token;

  @override
  State<ResetPasswordPage> createState() => _ResetPasswordPageState();
}

class _ResetPasswordPageState extends State<ResetPasswordPage> {
  late final String _token;
  final _password = TextEditingController();
  final _confirmation = TextEditingController();
  bool _loading = false;
  bool _done = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final fromWidget = widget.token?.trim() ?? '';
    _token = fromWidget.isNotEmpty
        ? fromWidget
        : (passwordResetTokenFromUri(Uri.base) ?? '');
  }

  @override
  void dispose() {
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_token.isEmpty || _loading || _done) return;
    final password = _password.text;
    final confirmation = _confirmation.text;
    if (password.length < 6) {
      setState(() {
        _error = 'A senha deverá conter no mínimo 6 caracteres.';
      });
      return;
    }
    if (password != confirmation) {
      setState(() {
        _error = 'As senhas não coincidem.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await context.read<ApiClient>().post(
        '/auth/password-reset/confirm',
        body: {
          'token': _token,
          'password': password,
          'passwordConfirmation': confirmation,
        },
      );
      if (!mounted) return;
      setState(() => _done = true);
    } on ApiException {
      if (!mounted) return;
      setState(() {
        _error = 'Este link é inválido ou já expirou.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Não foi possível redefinir a senha agora. Tente novamente.';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PublicPageFrame(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Redefinir senha',
            key: Key('reset-page-title'),
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w800,
              fontSize: 28,
              color: AppTheme.ink,
            ),
          ),
          const SizedBox(height: 12),
          if (_done)
            const Text(
              'Sua senha foi redefinida.',
              key: Key('reset-success'),
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w600,
                fontSize: 16,
                height: 1.5,
                color: AppTheme.ink,
              ),
            )
          else if (_token.isEmpty)
            const Text(
              'Este link é inválido ou já expirou.',
              key: Key('reset-invalid'),
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w400,
                fontSize: 15,
                height: 1.5,
                color: Color(0xFF4A524F),
              ),
            )
          else ...[
            const Text(
              'Escolha uma nova senha. A alteração só acontece depois que você confirmar neste formulário.',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w400,
                fontSize: 15,
                height: 1.5,
                color: Color(0xFF4A524F),
              ),
            ),
            const SizedBox(height: 24),
            TextField(
              key: const Key('reset-password'),
              controller: _password,
              obscureText: true,
              enabled: !_loading,
              style: const TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 15,
                color: AppTheme.ink,
              ),
              decoration: InputDecoration(
                hintText: 'Nova senha',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('reset-password-confirm'),
              controller: _confirmation,
              obscureText: true,
              enabled: !_loading,
              style: const TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 15,
                color: AppTheme.ink,
              ),
              decoration: InputDecoration(
                hintText: 'Confirmar senha',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              key: const Key('reset-submit'),
              onPressed: _loading ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: AppTheme.ink,
                foregroundColor: Colors.white,
                minimumSize: const Size(0, 48),
              ),
              child: _loading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Redefinir senha'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(
                key: const Key('reset-error'),
                _error!,
                style: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                  color: Color(0xFFE53935),
                ),
              ),
            ],
          ],
          const SizedBox(height: 24),
          TextButton(
            key: const Key('reset-back-login'),
            onPressed: () {
              Navigator.of(context).pushNamedAndRemoveUntil(
                AppRoutes.login,
                (route) => false,
              );
            },
            child: const Text('Voltar para o login'),
          ),
        ],
      ),
    );
  }
}
