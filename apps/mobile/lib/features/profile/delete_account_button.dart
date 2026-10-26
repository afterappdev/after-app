import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_controller.dart';

class DeleteAccountButton extends StatefulWidget {
  const DeleteAccountButton({super.key, this.forVenue = false});

  final bool forVenue;

  @override
  State<DeleteAccountButton> createState() => _DeleteAccountButtonState();
}

class _DeleteAccountButtonState extends State<DeleteAccountButton> {
  static const _danger = Color(0xFFE53935);
  bool _deleting = false;

  Future<void> _onPressed() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: Text(
            widget.forVenue ? 'Agendar exclusão do local' : 'Agendar exclusão da conta',
            style: const TextStyle(fontFamily: AppTheme.fontFamily),
          ),
          content: Text(
            widget.forVenue
                ? 'Sua conta de estabelecimento será desativada por 30 dias. '
                    'Durante esse período você pode recuperá-la fazendo login e escolhendo '
                    '"Recuperar minha conta".\n\n'
                    'Após 30 dias, dados elegíveis (perfil, mídias e promoções) poderão ser '
                    'removidos definitivamente, respeitando retenções legais.\n\n'
                    'Créditos e histórico financeiro permanecem preservados até a exclusão definitiva.\n\n'
                    'Deseja continuar?'
                : 'Sua conta será desativada por 30 dias. Durante esse período você pode '
                    'recuperá-la fazendo login e escolhendo "Recuperar minha conta".\n\n'
                    'Após 30 dias, dados elegíveis poderão ser removidos definitivamente, '
                    'respeitando retenções legais.\n\n'
                    'Deseja continuar?',
            style: const TextStyle(fontFamily: AppTheme.fontFamily, height: 1.4),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text(
                'Agendar exclusão',
                style: TextStyle(
                  color: _danger,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        );
      },
    );
    if (confirmed != true || !mounted) return;

    setState(() => _deleting = true);
    try {
      await context.read<AuthController>().requestAccountDeletion();
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          title: const Text(
            'Exclusão agendada',
            style: TextStyle(fontFamily: AppTheme.fontFamily),
          ),
          content: const Text(
            'Sua conta foi desativada. Você tem 30 dias para recuperá-la fazendo login novamente.',
            style: TextStyle(fontFamily: AppTheme.fontFamily, height: 1.4),
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Entendi'),
            ),
          ],
        ),
      );
      if (!mounted) return;
      Navigator.of(context).popUntil((route) => route.isFirst);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _deleting = false);
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _deleting = false);
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Não foi possível agendar a exclusão. Tente novamente.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_deleting) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: SizedBox(
          height: 22,
          width: 22,
          child: CircularProgressIndicator(
            strokeWidth: 2.4,
            color: _danger,
          ),
        ),
      );
    }

    return TextButton.icon(
      onPressed: _onPressed,
      icon: const Icon(Icons.delete_outline_rounded, color: _danger),
      label: Text(
        widget.forVenue ? 'Excluir conta do local' : 'Excluir minha conta',
        style: const TextStyle(
          fontFamily: AppTheme.fontFamily,
          fontWeight: FontWeight.w700,
          fontSize: 15,
          color: _danger,
        ),
      ),
    );
  }
}
