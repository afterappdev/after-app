import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'promo_push_coordinator.dart';

class PromoAlertsPreference extends StatelessWidget {
  const PromoAlertsPreference({super.key});

  static const title = 'Receber notificações de promoções';
  static const description =
      'Avisos quando estabelecimentos da sua cidade publicarem novidades VIP e promoções para hoje.';

  @override
  Widget build(BuildContext context) {
    final promo = _watch(context);
    if (promo == null) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'AVISOS',
          style: TextStyle(
            fontSize: 12,
            letterSpacing: 0.6,
            fontWeight: FontWeight.w700,
            color: Color(0xFF8B8B96),
          ),
        ),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
          ),
          padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
          child: promo.preferenceKnown
              ? _Switch(promo: promo)
              : _Unavailable(promo: promo),
        ),
      ],
    );
  }

  PromoPushCoordinator? _watch(BuildContext context) {
    try {
      return Provider.of<PromoPushCoordinator>(context);
    } on ProviderNotFoundException {
      return null;
    }
  }
}

class _Switch extends StatelessWidget {
  const _Switch({required this.promo});

  final PromoPushCoordinator promo;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    PromoAlertsPreference.title,
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  SizedBox(height: 4),
                  Text(
                    PromoAlertsPreference.description,
                    style: TextStyle(color: Color(0xFF8B8B96), fontSize: 13),
                  ),
                ],
              ),
            ),
            Switch(
              value: promo.enabled,
              onChanged: promo.saving ? null : promo.setEnabled,
            ),
          ],
        ),
        if (promo.statusMessage != null) ...[
          const SizedBox(height: 8),
          Text(
            promo.statusMessage!,
            style: const TextStyle(color: Color(0xFFB45309), fontSize: 13),
          ),
        ],
      ],
    );
  }
}

class _Unavailable extends StatelessWidget {
  const _Unavailable({required this.promo});

  final PromoPushCoordinator promo;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(promo.statusMessage ?? 'Carregando a preferência de avisos.'),
        TextButton(
          onPressed: promo.reloadPreference,
          child: const Text('Tentar novamente'),
        ),
      ],
    );
  }
}
