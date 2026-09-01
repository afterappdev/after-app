import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import 'account_deletion_uri.dart';
import 'public_chrome.dart';

const _genericRequestMessage =
    'Se existir uma conta com esse e-mail, enviaremos instruções para continuar.';

class AccountDeletionPage extends StatefulWidget {
  const AccountDeletionPage({super.key});

  @override
  State<AccountDeletionPage> createState() => _AccountDeletionPageState();
}

class _AccountDeletionPageState extends State<AccountDeletionPage> {
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
        '/users/delete-request',
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
        _feedback = 'Não foi possível enviar as instruções agora. Tente novamente mais tarde.';
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
            'Exclusão de conta',
            key: Key('deletion-page-title'),
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w800,
              fontSize: 28,
              color: AppTheme.ink,
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Você pode excluir a conta After de dois jeitos:\n'
            '• no aplicativo, autenticado, em Perfil → Excluir conta;\n'
            '• por esta página, informando o e-mail da conta. Enviaremos um link de confirmação só para esse e-mail.\n\n'
            'A exclusão remove a conta, o perfil do estabelecimento (se houver), favoritos, avaliações, notificações, créditos, publicações e os arquivos de upload associados.\n\n'
            'Nenhum dado extra é mantido pelo After além do que a lei eventualmente exigir. Não dá para desfazer depois da confirmação.\n\n'
            'Abrir o e-mail não exclui a conta. A exclusão só acontece se você confirmar no link.',
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
            key: const Key('deletion-email'),
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
            key: const Key('deletion-submit'),
            onPressed: _loading ? null : _submit,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFE53935),
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
                : const Text('Solicitar exclusão da conta'),
          ),
          if (_feedback != null) ...[
            const SizedBox(height: 16),
            Text(
              key: const Key('deletion-feedback'),
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
            child: const Text('Já tem conta? Entrar no After'),
          ),
        ],
      ),
    );
  }
}

class ConfirmAccountDeletionPage extends StatefulWidget {
  const ConfirmAccountDeletionPage({super.key, this.token});

  final String? token;

  @override
  State<ConfirmAccountDeletionPage> createState() =>
      _ConfirmAccountDeletionPageState();
}

class _ConfirmAccountDeletionPageState extends State<ConfirmAccountDeletionPage> {
  late final String _token;
  bool _loading = false;
  bool _done = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final fromWidget = widget.token?.trim() ?? '';
    _token = fromWidget.isNotEmpty
        ? fromWidget
        : (deletionConfirmTokenFromUri(Uri.base) ?? '');
  }

  Future<void> _confirm() async {
    if (_token.isEmpty || _loading || _done) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await context.read<ApiClient>().post(
        '/users/delete-confirm',
        body: {'token': _token},
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
        _error = 'Não foi possível concluir a exclusão agora. Tente novamente.';
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
            'Confirmar exclusão da conta',
            key: Key('deletion-confirm-title'),
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
              'Sua conta foi excluída.',
              key: Key('deletion-confirm-success'),
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
              key: Key('deletion-confirm-invalid'),
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
              'Confirmar agora exclui a conta After ligada a este link, incluindo perfil, mídia, favoritos, avaliações e publicações. Esta ação não pode ser desfeita.',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w400,
                fontSize: 15,
                height: 1.5,
                color: Color(0xFF4A524F),
              ),
            ),
            const SizedBox(height: 24),
            FilledButton(
              key: const Key('deletion-confirm-submit'),
              onPressed: _loading ? null : _confirm,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFE53935),
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
                  : const Text('Confirmar exclusão da minha conta'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(
                key: const Key('deletion-confirm-error'),
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
            key: const Key('deletion-confirm-back'),
            onPressed: () => goToPublicHome(context),
            child: const Text('Voltar para o início'),
          ),
        ],
      ),
    );
  }
}
