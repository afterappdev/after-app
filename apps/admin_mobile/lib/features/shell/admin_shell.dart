import 'package:flutter/material.dart';

import '../../core/router/admin_location.dart';
import '../../core/router/admin_navigation.dart';
import '../../core/theme/admin_theme.dart';
import '../accounts/account_detail_screen.dart';
import '../accounts/accounts_screen.dart';
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

  static const _titles = ['Dashboard', 'Contas', 'Vendas', 'Cupons', 'Denúncias'];

  @override
  void initState() {
    super.initState();
    _index = widget.initialLocation.sectionIndex;
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _openInitial(widget.initialLocation);
    });
  }

  @override
  void dispose() {
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

  PreferredSizeWidget _appBar() {
    return AppBar(
      title: Text(_titles[_index]),
      actions: [
        IconButton(
          tooltip: 'Perfil',
          onPressed: () {
            final section = _sectionFragment;
            publishAdminLocation('/perfil', replace: false);
            Navigator.of(context)
                .push(
                  MaterialPageRoute<void>(
                    builder: (_) => const SettingsScreen(),
                  ),
                )
                .whenComplete(() {
              if (!mounted) return;
              _appliedFragment = section;
              publishAdminLocation(section, replace: true);
            });
          },
          icon: const Icon(Icons.account_circle_outlined, size: 28),
        ),
      ],
    );
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

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 960;
    if (!wide) {
      return Scaffold(
        backgroundColor: AdminTheme.background,
        appBar: _appBar(),
        body: _pages(),
        bottomNavigationBar: DecoratedBox(
          decoration: BoxDecoration(
            color: AdminTheme.background,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 12,
                offset: const Offset(0, -2),
              ),
            ],
          ),
          child: NavigationBar(
            key: const Key('admin-nav-bar'),
            selectedIndex: _index,
            onDestinationSelected: _select,
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

    return Scaffold(
      backgroundColor: AdminTheme.background,
      body: Row(
        children: [
          NavigationRail(
            key: const Key('admin-nav-rail'),
            extended: MediaQuery.sizeOf(context).width >= 1180,
            minExtendedWidth: 196,
            backgroundColor: AdminTheme.background,
            selectedIndex: _index,
            onDestinationSelected: _select,
            labelType: MediaQuery.sizeOf(context).width >= 1180
                ? NavigationRailLabelType.none
                : NavigationRailLabelType.all,
            selectedIconTheme: const IconThemeData(color: AdminTheme.orange),
            indicatorColor: const Color(0xFFFFF1E6),
            destinations: const [
              NavigationRailDestination(
                icon: Icon(Icons.space_dashboard_outlined),
                selectedIcon: Icon(Icons.space_dashboard_rounded),
                label: Text('Dashboard'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.people_outline),
                selectedIcon: Icon(Icons.people),
                label: Text('Contas'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.payments_outlined),
                selectedIcon: Icon(Icons.payments),
                label: Text('Vendas'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.confirmation_number_outlined),
                selectedIcon: Icon(Icons.confirmation_number),
                label: Text('Cupons'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.flag_outlined),
                selectedIcon: Icon(Icons.flag),
                label: Text('Denúncias'),
              ),
            ],
          ),
          const VerticalDivider(width: 1, color: AdminTheme.border),
          Expanded(
            child: Scaffold(
              backgroundColor: AdminTheme.background,
              appBar: _appBar(),
              body: _pages(),
            ),
          ),
        ],
      ),
    );
  }
}
