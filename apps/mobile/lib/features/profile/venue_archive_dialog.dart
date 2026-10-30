import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// Confirma exclusão lógica de um estabelecimento do proprietário.
Future<bool> confirmVenueArchive(
  BuildContext context, {
  required String venueName,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (dialogContext) {
      return AlertDialog(
        title: const Text(
          'Excluir estabelecimento?',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w800,
          ),
        ),
        content: Text(
          'O local “$venueName” será removido da sua lista. '
          'Históricos e registros financeiros são preservados, '
          'mas novas operações neste local deixam de ser permitidas.',
          style: const TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontSize: 14,
            height: 1.4,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            key: const Key('venue-archive-confirm'),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFC62828),
            ),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Excluir estabelecimento'),
          ),
        ],
      );
    },
  );
  return result == true;
}
