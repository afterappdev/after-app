import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/network/api_client.dart';
import '../../core/widgets/status_body.dart';
import '../../data/admin_api.dart';
import '../../data/admin_coupon.dart';

class CouponDetailScreen extends StatefulWidget {
  const CouponDetailScreen({super.key, required this.id});

  final String id;

  @override
  State<CouponDetailScreen> createState() => _CouponDetailScreenState();
}

class _CouponDetailScreenState extends State<CouponDetailScreen> {
  AdminCouponDetail? data;
  String? error;
  bool loading = true;
  bool saving = false;

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
      final detail = await context.read<AdminApi>().coupon(widget.id);
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

  Future<void> _toggle() async {
    final coupon = data?.coupon;
    if (coupon == null || saving) return;
    final next = !coupon.active;
    if (!next) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Desativar cupom?'),
          content: const Text(
            'Estabelecimentos não poderão mais resgatar este código. O histórico de resgates será mantido.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Voltar'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Desativar'),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
    }
    setState(() => saving = true);
    try {
      await context.read<AdminApi>().updateCoupon(coupon.id, active: next);
      if (!mounted) return;
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cupom')),
      body: loading
          ? const StatusBody.loading()
          : error != null
          ? StatusBody.error(message: error!, onRetry: _load)
          : _body(data!),
    );
  }

  Widget _body(AdminCouponDetail detail) {
    final coupon = detail.coupon;
    final limit = coupon.maxRedemptions?.toString() ?? 'sem limite';
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                coupon.code,
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Text('${coupon.creditAmount} crédito(s) bônus'),
              const SizedBox(height: 4),
              Text('Status: ${coupon.statusLabel}'),
              Text('Utilizações: ${coupon.redemptionCount} de $limit'),
              Text('Por estabelecimento: ${coupon.maxRedemptionsPerVenue}'),
              Text(
                'Início: ${coupon.startsAt == null ? 'imediato' : formatDateTime(coupon.startsAt)}',
              ),
              Text(
                'Validade: ${coupon.expiresAt == null ? 'sem validade' : formatDateTime(coupon.expiresAt)}',
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: saving ? null : _toggle,
                child: Text(coupon.active ? 'Desativar' : 'Ativar'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'Resgates',
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
        ),
        const SizedBox(height: 8),
        if (detail.redemptions.isEmpty)
          const Text('Nenhum resgate ainda.')
        else
          ...detail.redemptions.map(
            (row) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: AdminCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      row.venueName,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    Text('${row.creditAmount} crédito(s)'),
                    Text(formatDateTime(row.redeemedAt)),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}
