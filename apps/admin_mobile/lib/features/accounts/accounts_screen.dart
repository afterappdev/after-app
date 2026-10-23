import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/router/admin_navigation.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/admin_layout.dart';
import '../../core/widgets/status_body.dart';
import '../../data/admin_account.dart';
import '../../data/admin_accounts_stats.dart';
import 'account_detail_screen.dart';
import 'accounts_controller.dart';

class AccountsScreen extends StatefulWidget {
  const AccountsScreen({super.key});

  @override
  State<AccountsScreen> createState() => _AccountsScreenState();
}

class _AccountsScreenState extends State<AccountsScreen> {
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AccountsController>().load();
    });
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AccountsController>();
    final isUsers = controller.role != 'VENUE';
    final isVenue = controller.role == 'VENUE';

    return AdminScrollPage(
      title: 'Contas',
      subtitle: 'Usuários e estabelecimentos cadastrados',
      onRefresh: () => controller.load(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                AdminSegmentCard(
                  label: 'Usuários',
                  value: formatCount(controller.totalUsers),
                  hint: 'Total no banco de dados',
                  icon: Icons.groups_outlined,
                  selected: isUsers,
                  accent: AdminTheme.orange,
                  onTap: () => controller.setRoleTab('USER'),
                ),
                const SizedBox(width: 12),
                AdminSegmentCard(
                  label: 'Estabelecimentos',
                  value: formatCount(controller.totalVenues),
                  hint: 'Total cadastrados',
                  icon: Icons.storefront_outlined,
                  selected: isVenue,
                  accent: AdminTheme.purple,
                  onTap: () => controller.setRoleTab('VENUE'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: _CityFilter(controller: controller),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: _DistributionPanel(
              loading: controller.loadingStats,
              isUsers: isUsers,
              cityFilter: controller.cityFilter,
              stats: controller.stats,
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: TextField(
              controller: _search,
              onChanged: controller.setQuery,
              decoration: InputDecoration(
                hintText: isVenue
                    ? 'Buscar por nome do local...'
                    : 'Buscar por nome, e-mail ou cidade...',
                prefixIcon: const Icon(Icons.search),
              ),
            ),
          ),
          const SizedBox(height: 8),
          _list(controller),
        ],
      ),
    );
  }

  Widget _list(AccountsController controller) {
    final items = controller.visibleItems;
    if (controller.loading && items.isEmpty) {
      return const StatusBody.loading(message: 'Carregando contas...');
    }
    if (controller.error != null && items.isEmpty) {
      return StatusBody.error(message: controller.error!, onRetry: controller.load);
    }
    if (items.isEmpty) {
      return const StatusBody.empty(
        title: 'Nenhuma conta',
        message: 'Não encontramos contas com esses filtros.',
      );
    }
    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification.metrics.pixels > notification.metrics.maxScrollExtent - 240) {
          controller.load(refresh: false);
        }
        return false;
      },
      child: ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        itemCount: items.length + (controller.loadingMore ? 1 : 0),
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          if (index >= items.length) {
            return const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            );
          }
          final account = items[index];
          return _AccountTile(account: account, controller: controller);
        },
      ),
    );
  }
}

class _CityFilter extends StatelessWidget {
  const _CityFilter({required this.controller});
  final AccountsController controller;

  @override
  Widget build(BuildContext context) {
    final cities = {
      for (final item in controller.items) item.city,
    }.where((c) => c.trim().isNotEmpty).toList()
      ..sort();
    final selected = controller.cityFilter;
    return AdminCard(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      child: Row(
        children: [
          const Icon(Icons.location_on_outlined, color: AdminTheme.purple, size: 22),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Filtrar por cidade',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          DropdownButtonHideUnderline(
            child: DropdownButton<String?>(
              value: selected,
              hint: const Text('Todas'),
              items: [
                const DropdownMenuItem<String?>(value: null, child: Text('Todas')),
                for (final city in cities)
                  DropdownMenuItem(value: city, child: Text(city)),
              ],
              onChanged: controller.setCityFilter,
            ),
          ),
        ],
      ),
    );
  }
}

class _AccountTile extends StatelessWidget {
  const _AccountTile({required this.account, required this.controller});

  final AdminAccount account;
  final AccountsController controller;

  @override
  Widget build(BuildContext context) {
    final isVenue = account.role == 'VENUE';
    return AdminCard(
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
      child: InkWell(
        onTap: () => _open(context),
        borderRadius: BorderRadius.circular(AdminTheme.radiusLg),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: isVenue
                  ? AdminTheme.purple.withValues(alpha: 0.12)
                  : AdminTheme.orange.withValues(alpha: 0.12),
              child: Icon(
                isVenue ? Icons.storefront_outlined : Icons.person_outline,
                color: isVenue ? AdminTheme.purple : AdminTheme.orange,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    account.displayName,
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    account.email,
                    style: const TextStyle(color: AdminTheme.textSecondary, fontSize: 12),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      _badge(
                        isVenue ? (account.venueName ?? 'Local') : roleLabel(account.role),
                        isVenue ? AdminTheme.purple : AdminTheme.orange,
                      ),
                      _badge('${account.city}, ${account.state}', AdminTheme.textSecondary),
                    ],
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: AdminTheme.textSecondary),
          ],
        ),
      ),
    );
  }

  Widget _badge(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color),
      ),
    );
  }

  Future<void> _open(BuildContext context) async {
    final deleted = await pushAdminPage<bool>(
      context,
      location: '/contas/${Uri.encodeComponent(account.id)}',
      builder: (_) => AccountDetailScreen(id: account.id),
    );
    if (!context.mounted) return;
    if (deleted == true) {
      await controller.accountDeleted(account.id);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Conta excluída com sucesso')),
      );
    }
  }
}

class _DistributionPanel extends StatelessWidget {
  const _DistributionPanel({
    required this.loading,
    required this.isUsers,
    required this.cityFilter,
    required this.stats,
  });

  final bool loading;
  final bool isUsers;
  final String? cityFilter;
  final AdminAccountsStats? stats;

  @override
  Widget build(BuildContext context) {
    if (loading && stats == null) {
      return const AdminCard(
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 20),
          child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
        ),
      );
    }
    if (stats == null) {
      return AdminUnavailablePanel(
        title: isUsers ? 'Usuários por faixa etária' : 'Locais por categoria',
        message: 'Não foi possível carregar os agregados de contas.',
      );
    }

    final scope = stats!.cityScope;
    final citySelected = cityFilter != null && cityFilter!.trim().isNotEmpty;
    List<CountBucket> buckets;
    String title;
    String subtitle;

    if (isUsers) {
      title = 'Usuários por faixa etária';
      if (citySelected && scope != null) {
        buckets = scope.usersByAgeBand;
        subtitle = '${scope.city}, ${scope.state} · ${formatCount(scope.users)} usuários';
      } else if (citySelected) {
        buckets = const [];
        subtitle = 'Informe estado válido para filtrar por cidade.';
      } else {
        buckets = stats!.usersByAgeBand;
        subtitle = 'Total no banco de dados';
      }
    } else {
      title = 'Locais por categoria';
      if (citySelected && scope != null) {
        buckets = scope.venuesByCategory;
        subtitle = '${scope.city}, ${scope.state} · ${formatCount(scope.venues)} locais';
      } else if (citySelected) {
        buckets = const [];
        subtitle = 'Selecione uma cidade presente na lista carregada.';
      } else {
        buckets = stats!.venuesByCategory;
        subtitle = 'Total cadastrados';
      }
    }

    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: AdminTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: const TextStyle(fontSize: 12, color: AdminTheme.textSecondary),
          ),
          const SizedBox(height: 12),
          if (buckets.isEmpty)
            const Text(
              'Sem dados para exibir.',
              style: TextStyle(color: AdminTheme.muted, fontSize: 13),
            )
          else
            for (var i = 0; i < buckets.length; i++) ...[
              _DistributionRow(
                label: isUsers
                    ? ageBandLabel(buckets[i].key)
                    : buckets[i].key,
                count: buckets[i].count,
                max: buckets.first.count,
              ),
              if (i != buckets.length - 1) const SizedBox(height: 8),
            ],
        ],
      ),
    );
  }
}

class _DistributionRow extends StatelessWidget {
  const _DistributionRow({
    required this.label,
    required this.count,
    required this.max,
  });

  final String label;
  final int count;
  final int max;

  @override
  Widget build(BuildContext context) {
    final ratio = max > 0 ? count / max : 0.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              ),
            ),
            Text(
              formatCount(count),
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
            ),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: ratio,
            minHeight: 6,
            backgroundColor: AdminTheme.purple.withValues(alpha: 0.08),
            color: AdminTheme.purple,
          ),
        ),
      ],
    );
  }
}
