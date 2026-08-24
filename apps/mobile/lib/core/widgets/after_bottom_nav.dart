import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../features/auth/auth_controller.dart';
import '../theme/app_theme.dart';

class AfterBottomNav extends StatelessWidget {
  const AfterBottomNav({
    super.key,
    required this.index,
    required this.onTap,
  });

  final int index;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final isVenue = context.watch<AuthController>().user?.isVenue == true;
    return Material(
      color: Colors.white,
      elevation: 8,
      shadowColor: Colors.black26,
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 70,
          child: Row(
            children: [
              _Item(
                icon: Icons.home_outlined,
                label: 'Home',
                selected: index == 0,
                onTap: () => onTap(0),
              ),
              _Item(
                icon: Icons.search,
                label: 'Pesquisar locais',
                selected: index == 1,
                onTap: () => onTap(1),
              ),
              if (isVenue)
                _Item(
                  icon: index == 2 ? Icons.image : Icons.image_outlined,
                  label: 'Publicar',
                  selected: index == 2,
                  onTap: () => onTap(2),
                )
              else
                _Item(
                  icon: index == 2 ? Icons.favorite : Icons.favorite_border,
                  label: 'Favoritos',
                  selected: index == 2,
                  onTap: () => onTap(2),
                ),
              _Item(
                icon: index == 3 ? Icons.person : Icons.person_outline,
                label: 'Perfil',
                selected: index == 3,
                onTap: () => onTap(3),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Item extends StatelessWidget {
  const _Item({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const accent = AppTheme.brand;
    const muted = AppTheme.muted;
    final color = selected ? accent : muted;
    return Expanded(
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(height: 4),
            Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 10,
                height: 1.15,
                fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
