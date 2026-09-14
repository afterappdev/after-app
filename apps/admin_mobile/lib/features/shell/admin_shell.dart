import 'package:flutter/material.dart';

import '../../core/theme/admin_theme.dart';
import '../accounts/accounts_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../sales/sales_screen.dart';
import '../settings/settings_screen.dart';

class AdminShell extends StatefulWidget {
  const AdminShell({super.key});

  @override
  State<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends State<AdminShell> {
  int _index = 0;

  static const _titles = ['Dashboard', 'Contas', 'Vendas'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AdminTheme.background,
      appBar: AppBar(
        title: Text(_titles[_index]),
        actions: [
          IconButton(
            tooltip: 'Perfil',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const SettingsScreen()),
              );
            },
            icon: const Icon(Icons.account_circle_outlined, size: 28),
          ),
        ],
      ),
      body: IndexedStack(
        index: _index,
        children: const [DashboardScreen(), AccountsScreen(), SalesScreen()],
      ),
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
          selectedIndex: _index,
          onDestinationSelected: (value) => setState(() => _index = value),
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
          ],
        ),
      ),
    );
  }
}
