import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'promo_alerts_preference.dart';

Future<bool?> showPromoLegacyActivationDialog(BuildContext context) {
  return showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (context) {
      return AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text(
          'Avisos de promoções',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w800,
          ),
        ),
        content: const Text(
          PromoAlertsPreference.description,
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontSize: 14,
            height: 1.35,
            color: Color(0xFF5C5C66),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Agora não'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.accentOrange,
            ),
            child: const Text('Ativar avisos'),
          ),
        ],
      );
    },
  );
}