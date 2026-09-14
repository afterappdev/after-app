import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/status_body.dart';
import '../../data/admin_account.dart';
import '../../data/admin_api.dart';

class AccountDetailScreen extends StatefulWidget {
  const AccountDetailScreen({super.key, required this.id});

  final String id;

  @override
  State<AccountDetailScreen> createState() => _AccountDetailScreenState();
}

class _AccountDetailScreenState extends State<AccountDetailScreen> {
  AdminAccountDetail? data;
  String? error;
  bool loading = true;
  bool deleting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final detail = await context.read<AdminApi>().account(widget.id);
      if (!mounted) return;
      setState(() {
        data = detail;
        loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _confirmDelete(AdminAccountDetail account) async {
    final venueWarning = account.role == 'VENUE' || account.venue != null
        ? '\n\nEstabelecimento, saldo, compras e dados relacionados também poderão ser removidos.'
        : '';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Excluir conta?'),
        content: Text(
          'Esta ação é permanente e não poderá ser desfeita.$venueWarning',
        ),
        actions: [
          TextButton(
            key: const Key('admin-delete-cancel'),
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            key: const Key('admin-delete-confirm'),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFB3261E),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Excluir definitivamente'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => deleting = true);
    try {
      await context.read<AdminApi>().deleteAccount(account.id);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => deleting = false);
      final message = e is ApiException
          ? e.message
          : 'Não foi possível excluir a conta.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Conta')),
      body: loading
          ? const StatusBody.loading()
          : error != null
          ? StatusBody.error(message: error!, onRetry: _load)
          : _body(data!),
    );
  }

  Widget _body(AdminAccountDetail account) {
    final venue = account.venue;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _row('Nome', account.name),
              _row('E-mail', account.email),
              _row('Tipo', roleLabel(account.role)),
              _row('Cidade', '${account.city} / ${account.state}'),
              _row('Cadastro', formatDateTime(account.createdAt)),
            ],
          ),
        ),
        if (venue != null) ...[
          const SizedBox(height: 16),
          AdminCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Estabelecimento',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                ),
                const SizedBox(height: 12),
                _row('Nome', venue.name),
                if (venue.category != null && venue.category!.isNotEmpty)
                  _row('Categoria', venue.category!),
                _row('Cidade', '${venue.city} / ${venue.state}'),
                _row('Saldo de créditos', formatCount(venue.creditBalance)),
                if (venue.description != null && venue.description!.isNotEmpty)
                  _row('Descrição', venue.description!),
              ],
            ),
          ),
        ],
        if (account.role != 'ADMIN') ...[
          const SizedBox(height: 24),
          FilledButton(
            key: const Key('admin-delete-account'),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFB3261E),
              foregroundColor: Colors.white,
              disabledBackgroundColor: const Color(0xFFB3261E).withValues(
                alpha: 0.5,
              ),
            ),
            onPressed: deleting ? null : () => _confirmDelete(account),
            child: Text(deleting ? 'Excluindo...' : 'Excluir conta'),
          ),
        ],
      ],
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: AdminTheme.muted,
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
          ),
        ],
      ),
    );
  }
}
