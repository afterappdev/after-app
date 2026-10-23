import 'package:flutter/material.dart';

import '../theme/admin_theme.dart';
import 'status_body.dart';

/// Desktop breakpoint for fixed sidebar layout.
const kAdminDesktopBreakpoint = 960.0;

class AdminPageHeader extends StatelessWidget {
  const AdminPageHeader({
    super.key,
    required this.title,
    required this.subtitle,
    this.trailing,
  });

  final String title;
  final String subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= kAdminDesktopBreakpoint;
    return Padding(
      padding: EdgeInsets.fromLTRB(wide ? 28 : 20, wide ? 20 : 12, wide ? 28 : 20, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontFamily: AdminTheme.fontFamily,
                    fontWeight: FontWeight.w800,
                    fontSize: 26,
                    height: 1.15,
                    color: AdminTheme.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontFamily: AdminTheme.fontFamily,
                    fontWeight: FontWeight.w500,
                    fontSize: 14,
                    height: 1.35,
                    color: AdminTheme.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          trailing ??
              IconButton(
                tooltip: 'Perfil',
                onPressed: () => onAdminProfileTap?.call(context),
                icon: const Icon(Icons.account_circle_outlined, size: 30),
                color: AdminTheme.textPrimary,
              ),
        ],
      ),
    );
  }
}

typedef AdminProfileTap = void Function(BuildContext context);
AdminProfileTap? onAdminProfileTap;

class AdminScrollPage extends StatelessWidget {
  const AdminScrollPage({
    super.key,
    required this.title,
    required this.subtitle,
    required this.child,
    this.trailing,
    this.onRefresh,
  });

  final String title;
  final String subtitle;
  final Widget child;
  final Widget? trailing;
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context) {
    final body = CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: AdminPageHeader(
            title: title,
            subtitle: subtitle,
            trailing: trailing,
          ),
        ),
        SliverToBoxAdapter(child: child),
        const SliverToBoxAdapter(child: SizedBox(height: 28)),
      ],
    );
    if (onRefresh == null) return body;
    return RefreshIndicator(onRefresh: onRefresh!, child: body);
  }
}

class AdminKpiCard extends StatelessWidget {
  const AdminKpiCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.tint,
    this.subtitle,
    this.unavailable = false,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color tint;
  final String? subtitle;
  final bool unavailable;

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: tint.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: tint, size: 22),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontFamily: AdminTheme.fontFamily,
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                    height: 1.25,
                    color: AdminTheme.textSecondary,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  value,
                  style: TextStyle(
                    fontFamily: AdminTheme.fontFamily,
                    fontWeight: FontWeight.w800,
                    fontSize: 22,
                    height: 1.05,
                    color: unavailable ? AdminTheme.textSecondary : AdminTheme.textPrimary,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle!,
                    style: const TextStyle(
                      fontFamily: AdminTheme.fontFamily,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AdminTheme.textSecondary,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class AdminSegmentCard extends StatelessWidget {
  const AdminSegmentCard({
    super.key,
    required this.label,
    required this.value,
    required this.hint,
    required this.icon,
    required this.selected,
    required this.onTap,
    this.accent = AdminTheme.orange,
  });

  final String label;
  final String value;
  final String hint;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: selected ? accent.withValues(alpha: 0.08) : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(
            color: selected ? accent : AdminTheme.border,
            width: selected ? 1.6 : 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, color: selected ? accent : AdminTheme.textSecondary, size: 24),
                const SizedBox(height: 10),
                Text(
                  label,
                  style: TextStyle(
                    fontFamily: AdminTheme.fontFamily,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: selected ? AdminTheme.textPrimary : AdminTheme.textSecondary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: TextStyle(
                    fontFamily: AdminTheme.fontFamily,
                    fontWeight: FontWeight.w800,
                    fontSize: 24,
                    color: selected ? accent : AdminTheme.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  hint,
                  style: const TextStyle(
                    fontFamily: AdminTheme.fontFamily,
                    fontSize: 11,
                    color: AdminTheme.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class AdminFilterChipRow extends StatelessWidget {
  const AdminFilterChipRow({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(children: children),
    );
  }
}

class AdminFilterChip extends StatelessWidget {
  const AdminFilterChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => onTap(),
        showCheckmark: selected,
        selectedColor: AdminTheme.orange.withValues(alpha: 0.14),
        labelStyle: TextStyle(
          fontFamily: AdminTheme.fontFamily,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
          color: selected ? AdminTheme.orange : AdminTheme.textPrimary,
        ),
        side: BorderSide(color: selected ? AdminTheme.orange : AdminTheme.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
    );
  }
}

class AdminSidebar extends StatelessWidget {
  const AdminSidebar({
    super.key,
    required this.selectedIndex,
    required this.onSelect,
    required this.onProfile,
    required this.onLogout,
  });

  final int selectedIndex;
  final ValueChanged<int> onSelect;
  final VoidCallback onProfile;
  final VoidCallback onLogout;

  static const _items = [
    (Icons.space_dashboard_outlined, Icons.space_dashboard_rounded, 'Dashboard'),
    (Icons.people_outline, Icons.people, 'Contas'),
    (Icons.payments_outlined, Icons.payments, 'Vendas'),
    (Icons.confirmation_number_outlined, Icons.confirmation_number, 'Cupons'),
    (Icons.flag_outlined, Icons.flag, 'Denúncias'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 248,
      color: Colors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 24),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                Image.asset(
                  'assets/images/logo_after.png',
                  height: 36,
                  filterQuality: FilterQuality.high,
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'ADMIN',
                    style: TextStyle(
                      fontFamily: AdminTheme.fontFamily,
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                      letterSpacing: 1.2,
                      color: AdminTheme.orange,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),
          for (var i = 0; i < _items.length; i++)
            _SidebarTile(
              key: Key('admin-sidebar-$i'),
              label: _items[i].$3,
              icon: _items[i].$1,
              selectedIcon: _items[i].$2,
              selected: selectedIndex == i,
              onTap: () => onSelect(i),
            ),
          const Spacer(),
          _SidebarTile(
            label: 'Perfil',
            icon: Icons.settings_outlined,
            selectedIcon: Icons.settings,
            selected: false,
            onTap: onProfile,
          ),
          _SidebarTile(
            label: 'Logout',
            icon: Icons.logout_rounded,
            selectedIcon: Icons.logout_rounded,
            selected: false,
            onTap: onLogout,
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}

class _SidebarTile extends StatelessWidget {
  const _SidebarTile({
    super.key,
    required this.label,
    required this.icon,
    required this.selectedIcon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      child: Material(
        color: selected ? AdminTheme.orange.withValues(alpha: 0.12) : Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Icon(
                  selected ? selectedIcon : icon,
                  size: 22,
                  color: selected ? AdminTheme.orange : AdminTheme.textSecondary,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontFamily: AdminTheme.fontFamily,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                      fontSize: 14,
                      color: selected ? AdminTheme.orange : AdminTheme.textPrimary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class AdminUnavailablePanel extends StatelessWidget {
  const AdminUnavailablePanel({
    super.key,
    required this.title,
    this.message = 'Integração pendente — sem dados fictícios.',
  });

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontFamily: AdminTheme.fontFamily,
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: AdminTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            message,
            style: const TextStyle(
              fontFamily: AdminTheme.fontFamily,
              fontSize: 13,
              height: 1.35,
              color: AdminTheme.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
