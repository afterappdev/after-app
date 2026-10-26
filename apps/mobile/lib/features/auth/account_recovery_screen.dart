import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/after_logo.dart';
import 'auth_controller.dart';
import 'models/deletion_status.dart';

class AccountRecoveryScreen extends StatefulWidget {
  const AccountRecoveryScreen({super.key});

  @override
  State<AccountRecoveryScreen> createState() => _AccountRecoveryScreenState();
}

class _AccountRecoveryScreenState extends State<AccountRecoveryScreen> {
  bool _recovering = false;
  String? _message;

  Future<void> _recover(PendingAccountRecovery pending) async {
    if (_recovering || !pending.status.canRecover) return;
    setState(() {
      _recovering = true;
      _message = null;
    });
    try {
      await context.read<AuthController>().cancelAccountDeletionRecovery();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _message = e.statusCode == 401
            ? 'Sua sessão de recuperação expirou. Faça login novamente para continuar.'
            : e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _message = 'Não foi possível recuperar a conta agora. Tente de novo.';
      });
    } finally {
      if (mounted) setState(() => _recovering = false);
    }
  }

  void _keepDeletion() {
    context.read<AuthController>().abandonAccountRecovery();
  }

  @override
  Widget build(BuildContext context) {
    final pending = context.watch<AuthController>().pendingAccountRecovery;
    if (pending == null) {
      return const SizedBox.shrink();
    }
    final status = pending.status;
    final canRecover = status.canRecover;
    final remaining = formatDeletionRemainingSeconds(status.remainingSeconds);
    final width = MediaQuery.sizeOf(context).width;
    final compact = width < 640;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.symmetric(
              horizontal: compact ? 20 : 32,
              vertical: 24,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: AfterLogo(height: 64)),
                  const SizedBox(height: 28),
                  Text(
                    canRecover
                        ? 'Sua conta ainda pode ser recuperada!'
                        : 'Recuperação indisponível',
                    key: const Key('recovery-title'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      fontWeight: FontWeight.w800,
                      fontSize: 22,
                      color: AppTheme.ink,
                      height: 1.25,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AppTheme.canvas,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppTheme.sageBorder),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (canRecover) ...[
                          const Text(
                            'Sua conta está desativada e aguardando exclusão definitiva. '
                            'Durante 30 dias você pode cancelar e voltar a usar o After normalmente.',
                            style: TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              fontSize: 15,
                              height: 1.45,
                              color: AppTheme.ink,
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'Tempo restante para recuperar: $remaining',
                            key: const Key('recovery-remaining'),
                            style: const TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                              color: AppTheme.accentPurple,
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Após o prazo, dados elegíveis poderão ser removidos definitivamente, '
                            'respeitando retenções legais.',
                            style: TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              fontSize: 13,
                              height: 1.4,
                              color: AppTheme.muted,
                            ),
                          ),
                        ] else ...[
                          const Text(
                            'O prazo de 30 dias para recuperar esta conta já terminou, '
                            'ou a exclusão definitiva já está em andamento. '
                            'Não é possível restaurar o acesso por aqui.',
                            key: Key('recovery-expired'),
                            style: TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              fontSize: 15,
                              height: 1.45,
                              color: AppTheme.ink,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (_message != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      _message!,
                      key: const Key('recovery-message'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: AppTheme.brand,
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  if (canRecover)
                    FilledButton(
                      key: const Key('recovery-confirm'),
                      onPressed: _recovering ? null : () => _recover(pending),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppTheme.accentPurple,
                        foregroundColor: Colors.white,
                        minimumSize: const Size.fromHeight(48),
                      ),
                      child: _recovering
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.4,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Recuperar minha conta'),
                    ),
                  if (canRecover) const SizedBox(height: 12),
                  OutlinedButton(
                    key: const Key('recovery-keep-deletion'),
                    onPressed: _recovering ? null : _keepDeletion,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.ink,
                      side: const BorderSide(color: AppTheme.sageBorder),
                      minimumSize: const Size.fromHeight(48),
                    ),
                    child: const Text('Manter exclusão'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
