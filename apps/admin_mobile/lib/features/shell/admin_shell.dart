import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/router/admin_location.dart';
import '../../core/router/admin_navigation.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/admin_layout.dart';
import '../accounts/account_detail_screen.dart';
import '../accounts/accounts_screen.dart';
import '../auth/auth_controller.dart';
import '../coupons/coupon_detail_screen.dart';
import '../coupons/coupon_form_screen.dart';
import '../coupons/coupons_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../reports/report_detail_screen.dart';
import '../reports/reports_screen.dart';
import '../sales/sale_detail_screen.dart';
import '../sales/sales_screen.dart';
import '../settings/settings_screen.dart';

class AdminShell extends StatefulWidget {
  const AdminShell({super.key, this.initialLocation = AdminLocation.dashboard});

  final AdminLocation initialLocation;

  @override
  State<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends State<AdminShell> with WidgetsBindingObserver {
  late int _index;
  String? _appliedFragment;

  @override
  void initState() {
    super.initState();
    _index = widget.initialLocation.sectionIndex;
    WidgetsBinding.instance.addObserver(this);
    onAdminProfileTap = _openProfile;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _openInitial(widget.initialLocation);
    });
  }

  @override
  void dispose() {
    if (onAdminProfileTap == _openProfile) {
      onAdminProfileTap = null;
    }
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  String get _sectionFragment =>
      AdminLocation(section: AdminSection.values[_index]).fragment;

  @override
  Future<bool> didPushRouteInformation(RouteInformation routeInformation) async {
    final location = locationFromUri(routeInformation.uri);
    if (location.fragment == _appliedFragment) return true;
    _show(location);
    return true;
  }

  void _select(int index) {
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
    setState(() => _index = index);
    _appliedFragment = _sectionFragment;
    publishAdminLocation(_sectionFragment, replace: true);
  }

  void _openProfile(BuildContext context) {
    final section = _sectionFragment;
    publishAdminLocation('/perfil', replace: false);
    Navigator.of(context)
        .push(MaterialPageRoute<void>(builder: (_) => const SettingsScreen()))
        .whenComplete(() {
      if (!mounted) return;
      _appliedFragment = section;
      publishAdminLocation(section, replace: true);
    });
  }

  Future<void> _logout() async {
    await context.read<AuthController>().logout();
  }

  void _openInitial(AdminLocation location) {
    _appliedFragment = location.fragment;
    publishAdminLocation(location.fragment, replace: true);
    final page = _pageFor(location);
    if (page == null) return;
    final section = _sectionFragment;
    final opened = location.fragment;
    Navigator.of(context)
        .push(MaterialPageRoute<void>(builder: (_) => page))
        .whenComplete(() {
      if (!mounted) return;
      if (_appliedFragment != opened) return;
      _appliedFragment = section;
      publishAdminLocation(section, replace: true);
    });
  }

  void _show(AdminLocation location) {
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
    setState(() => _index = location.sectionIndex);
    _appliedFragment = location.fragment;
    final page = _pageFor(location);
    if (page == null) return;
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page));
  }

  Widget? _pageFor(AdminLocation location) {
    if (location.settings) return const SettingsScreen();
    if (location.newCoupon) return const CouponFormScreen();
    final id = location.detailId;
    if (id == null || id.isEmpty) return null;
    return switch (location.section) {
      AdminSection.accounts => AccountDetailScreen(id: id),
      AdminSection.sales => SaleDetailScreen(id: id),
      AdminSection.coupons => CouponDetailScreen(id: id),
      AdminSection.reports => ReportDetailScreen(id: id),
      AdminSection.dashboard => null,
    };
  }

  Widget _pages() {
    return AdminShellScope(
      sectionFragment: _sectionFragment,
      child: IndexedStack(
        index: _index,
        children: const [
          DashboardScreen(),
          AccountsScreen(),
          SalesScreen(),
          CouponsScreen(),
          ReportsScreen(),
        ],
      ),
    );
  }

  Widget _mobileNav() {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 16,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: NavigationBar(
          key: const Key('admin-nav-bar'),
          selectedIndex: _index,
          onDestinationSelected: _select,
          backgroundColor: Colors.white,
          indicatorColor: AdminTheme.orange.withValues(alpha: 0.14),
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.space_dashboard_outlined),
              selectedIcon: Icon(Icons.space_dashboard_rounded),
              label: 'Dashboard',
            ),
            NavigationDestination(
              icon: Icon(Icons.people_outline),
              selectedIcon: Icon(Icons.people),
              label: 'Contas',
            ),
            NavigationDestination(
              icon: Icon(Icons.payments_outlined),
              selectedIcon: Icon(Icons.payments),
              label: 'Vendas',
            ),
            NavigationDestination(
              icon: Icon(Icons.confirmation_number_outlined),
              selectedIcon: Icon(Icons.confirmation_number),
              label: 'Cupons',
            ),
            NavigationDestination(
              icon: Icon(Icons.flag_outlined),
              selectedIcon: Icon(Icons.flag),
              label: 'Denúncias',
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= kAdminDesktopBreakpoint;
    if (!wide) {
      return Scaffold(
        backgroundColor: AdminTheme.pageBackground,
        body: _pages(),
        bottomNavigationBar: _mobileNav(),
      );
    }

    return Scaffold(
      backgroundColor: AdminTheme.pageBackground,
      body: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AdminSidebar(
            key: const Key('admin-nav-rail'),
            selectedIndex: _index,
            onSelect: _select,
            onProfile: () => _openProfile(context),
            onLogout: _logout,
          ),
          const VerticalDivider(width: 1, thickness: 1, color: AdminTheme.border),
          Expanded(child: _pages()),
        ],
      ),
    );
  }
}
