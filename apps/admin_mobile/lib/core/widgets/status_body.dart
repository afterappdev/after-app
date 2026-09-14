import 'package:flutter/material.dart';

import '../theme/admin_theme.dart';

class StatusBody extends StatelessWidget {
  const StatusBody({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const StatusBody.loading({Key? key, String message = 'Carregando...'})
    : this(
        key: key,
        icon: Icons.hourglass_empty_rounded,
        title: 'Aguarde',
        message: message,
      );

  const StatusBody.empty({
    Key? key,
    required String title,
    required String message,
  }) : this(
         key: key,
         icon: Icons.inbox_outlined,
         title: title,
         message: message,
       );

  factory StatusBody.error({required String message, VoidCallback? onRetry}) {
    return StatusBody(
      icon: Icons.wifi_off_rounded,
      title: 'Não foi possível carregar',
      message: message,
      actionLabel: onRetry == null ? null : 'Tentar novamente',
      onAction: onRetry,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 36, color: AdminTheme.muted),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 18,
                color: AdminTheme.ink,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AdminTheme.muted, height: 1.4),
            ),
            if (onAction != null) ...[
              const SizedBox(height: 18),
              FilledButton(
                onPressed: onAction,
                child: Text(actionLabel ?? 'Tentar novamente'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class AdminCard extends StatelessWidget {
  const AdminCard({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AdminTheme.background,
        borderRadius: BorderRadius.circular(AdminTheme.radiusLg),
        border: Border.all(color: AdminTheme.border),
        boxShadow: AdminTheme.cardShadow,
      ),
      child: child,
    );
  }
}
