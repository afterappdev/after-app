import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/status_body.dart';
import '../../data/admin_api.dart';
import '../../data/admin_sale.dart';

class SaleDetailScreen extends StatefulWidget {
  const SaleDetailScreen({super.key, required this.id});

  final String id;

  @override
  State<SaleDetailScreen> createState() => _SaleDetailScreenState();
}

class _SaleDetailScreenState extends State<SaleDetailScreen> {
  AdminSaleDetail? data;
  String? error;
  bool loading = true;

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
      final detail = await context.read<AdminApi>().sale(widget.id);
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Venda')),
      body: loading
          ? const StatusBody.loading()
          : error != null
          ? StatusBody.error(message: error!, onRetry: _load)
          : _body(data!),
    );
  }

  Widget _body(AdminSaleDetail detail) {
    final sale = detail.sale;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                formatBrl(sale.amountPaid),
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Faturamento bruto',
                style: TextStyle(color: AdminTheme.muted),
              ),
              const SizedBox(height: 16),
              _row('Créditos', formatCount(sale.credits)),
              _row('Pacote', sale.packageKey),
              _row('Origem', providerLabel(sale.provider)),
              _row('Moeda', sale.currency),
              _row('Status', statusLabel(sale.status)),
              _row('Confirmado em', formatDateTime(sale.confirmedAt)),
            ],
          ),
        ),
        if (_showsRefund(sale)) ...[
          const SizedBox(height: 16),
          _refundCard(sale),
        ],
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
              _row('Nome', detail.venue.name),
              _row('Cidade', '${detail.venue.city} / ${detail.venue.state}'),
            ],
          ),
        ),
      ],
    );
  }

  bool _showsRefund(AdminSale sale) {
    return sale.status.toUpperCase() == 'REFUNDED' ||
        sale.refundAudits.isNotEmpty ||
        sale.hasPartialReview;
  }

  Widget _refundCard(AdminSale sale) {
    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            sale.hasPartialReview
                ? 'Reembolso parcial — revisão necessária'
                : sale.hasOpenRefundReview
                    ? 'Reembolso — verificação necessária'
                    : 'Estorno',
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
          ),
          const SizedBox(height: 12),
          _row('Valor original', formatBrl(sale.amountPaid)),
          _row('Créditos adquiridos', formatCount(sale.credits)),
          for (final audit in sale.refundAudits) ...[
            if (audit.kind == 'refund_review')
              _row(
                sale.hasOpenRefundReview ? 'Situação' : 'Verificação anterior',
                sale.hasOpenRefundReview
                    ? 'Sinal recebido sem comprovação suficiente. A compra continua paga.'
                    : 'Resolvida',
              ),
            if (audit.kind != 'refund_review' && audit.refundedAmount != null)
              _row('Valor reembolsado', formatBrl(audit.refundedAmount!)),
            if (audit.recordedAt != null)
              _row(
                'Registrado na auditoria em',
                formatDateTime(audit.recordedAt),
              ),
            if (audit.creditsRecovered != null)
              _row(
                'Créditos recuperados',
                formatCount(audit.creditsRecovered!),
              ),
            if (audit.creditsUnrecovered != null)
              _row(
                'Créditos não recuperados',
                formatCount(audit.creditsUnrecovered!),
              ),
            if (audit.refundId != null)
              _row('Identificador do reembolso', audit.refundId!),
          ],
        ],
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 168,
            child: Text(
              label,
              style: const TextStyle(
                color: AdminTheme.muted,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
