import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/status_body.dart';
import '../../data/admin_api.dart';
import '../../data/admin_finance.dart';

class FinanceEntryFormPanel extends StatefulWidget {
  const FinanceEntryFormPanel({
    super.key,
    this.embedded = false,
    this.onClose,
    this.onCreated,
  });

  final bool embedded;
  final VoidCallback? onClose;
  final VoidCallback? onCreated;

  @override
  State<FinanceEntryFormPanel> createState() => _FinanceEntryFormPanelState();
}

class _FinanceEntryFormPanelState extends State<FinanceEntryFormPanel> {
  final _description = TextEditingController();
  final _amount = TextEditingController();
  final _notes = TextEditingController();
  AdminFinanceDirection _direction = AdminFinanceDirection.inflow;
  AdminFinanceCategory _category = AdminFinanceCategory.outros;
  DateTime _occurredAt = DateTime.now();
  bool _saving = false;

  @override
  void dispose() {
    _description.dispose();
    _amount.dispose();
    _notes.dispose();
    super.dispose();
  }

  InputDecoration _decoration({String? hint, String? helper}) {
    return InputDecoration(
      hintText: hint,
      helperText: helper,
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AdminTheme.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AdminTheme.border),
      ),
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _occurredAt,
      firstDate: DateTime(2024),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() => _occurredAt = picked);
  }

  Future<void> _save() async {
    if (_saving) return;
    final desc = _description.text.trim();
    final value = double.tryParse(_amount.text.trim().replaceAll(',', '.'));
    if (desc.isEmpty) {
      _snack('Informe a descrição.');
      return;
    }
    if (value == null || value <= 0) {
      _snack('Informe um valor maior que zero.');
      return;
    }
    setState(() => _saving = true);
    try {
      await context.read<AdminApi>().createFinanceEntry(
        direction: _direction,
        description: desc,
        amountBrl: value,
        category: _category,
        occurredAt: _occurredAt.toUtc().toIso8601String(),
        notes: _notes.text.trim(),
      );
      if (!mounted) return;
      widget.onCreated?.call();
      if (!widget.embedded) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) _snack(e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  String _dateLabel(DateTime value) {
    final d = value.day.toString().padLeft(2, '0');
    final m = value.month.toString().padLeft(2, '0');
    return '$d/$m/${value.year}';
  }

  Widget _directionToggle() {
    return Row(
      children: [
        Expanded(
          child: _DirectionCard(
            label: 'Entrada',
            icon: Icons.arrow_upward_rounded,
            color: AdminTheme.green,
            selected: _direction == AdminFinanceDirection.inflow,
            onTap: () => setState(() => _direction = AdminFinanceDirection.inflow),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _DirectionCard(
            label: 'Saída',
            icon: Icons.arrow_downward_rounded,
            color: AdminTheme.pink,
            selected: _direction == AdminFinanceDirection.outflow,
            onTap: () => setState(() => _direction = AdminFinanceDirection.outflow),
          ),
        ),
      ],
    );
  }

  Widget _formBody() {
    return ListView(
      padding: EdgeInsets.fromLTRB(widget.embedded ? 16 : 20, 12, widget.embedded ? 16 : 20, 24),
      children: [
        _directionToggle(),
        const SizedBox(height: 16),
        TextField(
          controller: _description,
          decoration: _decoration(hint: 'Ex.: Venda de créditos (PIX)'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: _decoration(hint: 'Ex.: 250,00'),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<AdminFinanceCategory>(
          value: _category,
          decoration: _decoration(hint: 'Selecione uma categoria'),
          items: AdminFinanceCategory.values
              .map(
                (c) => DropdownMenuItem(value: c, child: Text(c.label)),
              )
              .toList(),
          onChanged: (value) {
            if (value != null) setState(() => _category = value);
          },
        ),
        const SizedBox(height: 12),
        InkWell(
          onTap: _pickDate,
          borderRadius: BorderRadius.circular(14),
          child: InputDecorator(
            decoration: _decoration(),
            child: Row(
              children: [
                Expanded(child: Text(_dateLabel(_occurredAt))),
                const Icon(Icons.calendar_today_outlined, size: 18, color: AdminTheme.purple),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _notes,
          minLines: 2,
          maxLines: 4,
          decoration: _decoration(hint: 'Adicione uma observação...'),
        ),
        const SizedBox(height: 20),
        SizedBox(
          height: 50,
          child: FilledButton(
            onPressed: _saving ? null : _save,
            style: FilledButton.styleFrom(
              backgroundColor: AdminTheme.orange,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: Text(
              _saving ? 'Salvando...' : 'Adicionar movimentação',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.embedded) {
      return AdminCard(
        padding: EdgeInsets.zero,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 4, 0),
              child: Row(
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Nova movimentação',
                          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
                        ),
                        Text(
                          'Adicione uma entrada ou saída',
                          style: TextStyle(fontSize: 12, color: AdminTheme.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  IconButton(icon: const Icon(Icons.close), onPressed: widget.onClose),
                ],
              ),
            ),
            Expanded(child: _formBody()),
          ],
        ),
      );
    }
    return Scaffold(
      backgroundColor: AdminTheme.pageBackground,
      appBar: AppBar(
        title: const Text('Nova movimentação'),
      ),
      body: _formBody(),
    );
  }
}

class _DirectionCard extends StatelessWidget {
  const _DirectionCard({
    required this.label,
    required this.icon,
    required this.color,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: selected ? color.withValues(alpha: 0.15) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? color : AdminTheme.border,
            width: selected ? 2 : 1,
          ),
        ),
        child: Column(
          children: [
            Icon(icon, color: color),
            const SizedBox(height: 4),
            Text(label, style: TextStyle(fontWeight: FontWeight.w800, color: color)),
          ],
        ),
      ),
    );
  }
}
