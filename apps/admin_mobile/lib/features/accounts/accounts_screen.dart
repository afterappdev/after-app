import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/widgets/status_body.dart';
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
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: TextField(
            controller: _search,
            onChanged: controller.setQuery,
            decoration: const InputDecoration(
              hintText: 'Buscar por nome, e-mail ou estabelecimento',
              prefixIcon: Icon(Icons.search),
            ),
          ),
        ),
        const SizedBox(height: 10),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              _chip(controller, 'Todos', null),
              const SizedBox(width: 8),
              _chip(controller, 'Usuários', 'USER'),
              const SizedBox(width: 8),
              _chip(controller, 'Estabelecimentos', 'VENUE'),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Expanded(child: _list(controller)),
      ],
    );
  }

  Widget _chip(AccountsController controller, String label, String? role) {
    final selected = controller.role == role;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => controller.setRole(role),
    );
  }

  Widget _list(AccountsController controller) {
    if (controller.loading && controller.items.isEmpty) {
      return const StatusBody.loading(message: 'Carregando contas...');
    }
    if (controller.error != null && controller.items.isEmpty) {
      return StatusBody.error(
        message: controller.error!,
        onRetry: controller.load,
      );
    }
    if (controller.items.isEmpty) {
      return const StatusBody.empty(
        title: 'Nenhuma conta',
        message: 'Não encontramos contas com esses filtros.',
      );
    }
    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification.metrics.pixels >
            notification.metrics.maxScrollExtent - 240) {
          controller.load(refresh: false);
        }
        return false;
      },
      child: RefreshIndicator(
        onRefresh: () => controller.load(),
        child: ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          itemCount: controller.items.length + (controller.loadingMore ? 1 : 0),
          separatorBuilder: (_, _) => const SizedBox(height: 8),
          itemBuilder: (context, index) {
            if (index >= controller.items.length) {
              return const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            final account = controller.items[index];
            return AdminCard(
              padding: EdgeInsets.zero,
              child: ListTile(
                title: Text(
                  account.displayName,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  '${account.email}\n${roleLabel(account.role)} · ${formatDate(account.createdAt)}',
                ),
                isThreeLine: true,
                onTap: () async {
                  final deleted = await Navigator.of(context).push<bool>(
                    MaterialPageRoute(
                      builder: (_) => AccountDetailScreen(id: account.id),
                    ),
                  );
                  if (!context.mounted) return;
                  if (deleted == true) {
                    await controller.accountDeleted(account.id);
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Conta excluída com sucesso'),
                      ),
                    );
                  }
                },
              ),
            );
          },
        ),
      ),
    );
  }
}
