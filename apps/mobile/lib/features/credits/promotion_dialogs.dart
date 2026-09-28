import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

Future<bool> showPublishPromotionDialog(
  BuildContext context, {
  required int credits,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: const Text(
          'Confirmar publicação',
          style: TextStyle(fontFamily: AppTheme.fontFamily, fontWeight: FontWeight.w800),
        ),
        content: Text(
          'Esta publicação utilizará $credits crédito(s) da sua carteira. Após a publicação, os créditos utilizados não serão devolvidos, mesmo que você exclua a promoção posteriormente.',
          style: const TextStyle(fontFamily: AppTheme.fontFamily, height: 1.35),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Voltar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Publicar'),
          ),
        ],
      );
    },
  );
  return confirmed == true;
}

Future<bool> showDeletePromotionDialog(BuildContext context) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: const Text(
          'Excluir promoção?',
          style: TextStyle(fontFamily: AppTheme.fontFamily, fontWeight: FontWeight.w800),
        ),
        content: const Text(
          'Esta promoção deixará de ser exibida no After. Os créditos utilizados na publicação não serão devolvidos.',
          style: TextStyle(fontFamily: AppTheme.fontFamily, height: 1.35),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Excluir promoção'),
          ),
        ],
      );
    },
  );
  return confirmed == true;
}
