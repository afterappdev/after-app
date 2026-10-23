enum AdminSection { dashboard, accounts, sales, coupons, reports }

class AdminLocation {
  const AdminLocation({
    required this.section,
    this.detailId,
    this.newCoupon = false,
    this.settings = false,
  });

  final AdminSection section;
  final String? detailId;
  final bool newCoupon;
  final bool settings;

  static const dashboard = AdminLocation(section: AdminSection.dashboard);

  int get sectionIndex => section.index;

  String get fragment {
    if (settings) return '/perfil';
    if (newCoupon) return '/cupons/novo';
    final base = switch (section) {
      AdminSection.dashboard => '/dashboard',
      AdminSection.accounts => '/contas',
      AdminSection.sales => '/vendas',
      AdminSection.coupons => '/cupons',
      AdminSection.reports => '/denuncias',
    };
    final id = detailId;
    if (id == null || id.isEmpty) return base;
    return '$base/${Uri.encodeComponent(id)}';
  }
}

/// Reads a hash route (`#/contas/id`) or a path under `/admin`.
AdminLocation parseAdminLocation(String raw) {
  var value = raw.trim();
  if (value.startsWith('#')) value = value.substring(1);
  if (value.isEmpty || value == '/') return AdminLocation.dashboard;
  final uri = Uri.parse(value.startsWith('/') ? value : '/$value');
  final parts = uri.pathSegments.where((part) => part.isNotEmpty).toList();
  if (parts.isNotEmpty && parts.first == 'admin') {
    parts.removeAt(0);
  }
  if (parts.isNotEmpty && parts.last == 'index.html') {
    parts.removeLast();
  }
  if (parts.isEmpty) return AdminLocation.dashboard;
  final head = parts.first;
  final rest = parts.length > 1 ? Uri.decodeComponent(parts[1]) : null;
  return switch (head) {
    'dashboard' => AdminLocation.dashboard,
    'contas' => AdminLocation(section: AdminSection.accounts, detailId: rest),
    'vendas' => AdminLocation(section: AdminSection.sales, detailId: rest),
    'cupons' when rest == 'novo' => const AdminLocation(
        section: AdminSection.coupons,
        newCoupon: true,
      ),
    'cupons' => AdminLocation(section: AdminSection.coupons, detailId: rest),
    'denuncias' => AdminLocation(section: AdminSection.reports, detailId: rest),
    'perfil' => const AdminLocation(
        section: AdminSection.dashboard,
        settings: true,
      ),
    _ => AdminLocation.dashboard,
  };
}

/// Browser address of the admin app. The fragment is the in-app route, so a
/// refresh still requests only `/admin/` from the static host.
AdminLocation locationFromUri(Uri uri) {
  if (uri.fragment.isNotEmpty) return parseAdminLocation(uri.fragment);
  return parseAdminLocation(uri.path);
}
