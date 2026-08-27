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
            widget.forVenue ? 'Excluir conta do local' : 'Excluir conta',
            style: const TextStyle(fontFamily: AppTheme.fontFamily),
          ),
          content: Text(
            widget.forVenue
                ? 'Tem certeza de que deseja excluir a conta do local? Esta ação não pode ser desfeita. O perfil, fotos, uploads e promoções serão removidos.'
                : 'Tem certeza de que deseja excluir sua conta? Esta ação não pode ser desfeita. Seus dados, fotos e uploads serão removidos.',
            style: const TextStyle(fontFamily: AppTheme.fontFamily),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Não'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text(
                'Sim',
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
      await context.read<AuthController>().deleteAccount();
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
        const SnackBar(content: Text('Não foi possível excluir a conta.')),
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
        widget.forVenue ? 'Excluir conta do local' : 'Excluir conta',
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
