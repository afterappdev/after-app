import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/theme/app_theme.dart';

const kVenueProfileVisibilityHintPending =
    'venue_profile_visibility_hint_pending_v1';

const kVenueProfileVisibilityHintText =
    'Para o seu estabelecimento aparecer para os usuários do After, preencha logo, '
    'capa, endereço, descrição e horário de funcionamento. Sem isso, o cadastro '
    'não será exibido na busca e na Home.';

Future<void> markVenueProfileVisibilityHintPending() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool(kVenueProfileVisibilityHintPending, true);
}

Future<bool> consumeVenueProfileVisibilityHintPending() async {
  final prefs = await SharedPreferences.getInstance();
  if (prefs.getBool(kVenueProfileVisibilityHintPending) != true) return false;
  await prefs.remove(kVenueProfileVisibilityHintPending);
  return true;
}

class VenueProfileVisibilityHintCard extends StatelessWidget {
  const VenueProfileVisibilityHintCard({super.key, required this.onDismiss});

  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF6EE),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFF58634).withValues(alpha: 0.45)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline, size: 20, color: Color(0xFFF58634)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              kVenueProfileVisibilityHintText,
              style: const TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 12,
                height: 1.4,
                color: Color(0xFF3D3D42),
              ),
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
            onPressed: onDismiss,
            icon: const Icon(Icons.close, size: 18, color: Color(0xFF8B8B96)),
          ),
        ],
      ),
    );
  }
}
