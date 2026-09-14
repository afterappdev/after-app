import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_theme.dart';
import 'credits_ui.dart';
import 'fiscal_invoice_controller.dart';

class FiscalInvoiceSection extends StatelessWidget {
  const FiscalInvoiceSection({
    super.key,
    required this.controller,
    required this.onChanged,
  });

  final FiscalInvoiceController controller;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Dados fiscais',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: kCreditsInk,
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            'Deseja informar dados para emissão fiscal?',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 13,
              height: 1.35,
              color: kCreditsInk,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _ChoiceChip(
                  key: const Key('fiscal-request-no'),
                  label: 'Não',
                  selected: !controller.invoiceRequested,
                  onTap: () {
                    controller.invoiceRequested = false;
                    onChanged();
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _ChoiceChip(
                  key: const Key('fiscal-request-yes'),
                  label: 'Sim',
                  selected: controller.invoiceRequested,
                  onTap: () {
                    controller.invoiceRequested = true;
                    onChanged();
                  },
                ),
              ),
            ],
          ),
          if (controller.invoiceRequested) ...[
            const SizedBox(height: 14),
            const Text(
              'Tipo de documento',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w700,
                fontSize: 12,
                color: kCreditsInk,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _ChoiceChip(
                    key: const Key('fiscal-type-cpf'),
                    label: 'CPF',
                    selected: controller.personType == 'CPF',
                    onTap: () {
                      controller.personType = 'CPF';
                      controller.documentMasked = '';
                      onChanged();
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _ChoiceChip(
                    key: const Key('fiscal-type-cnpj'),
                    label: 'CNPJ',
                    selected: controller.personType == 'CNPJ',
                    onTap: () {
                      controller.personType = 'CNPJ';
                      controller.documentMasked = '';
                      onChanged();
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _FiscalField(
              key: const Key('fiscal-name'),
              hint: controller.personType == 'CNPJ'
                  ? 'Razão social'
                  : 'Nome completo',
              initial: controller.name,
              onChanged: (value) {
                controller.name = value;
                onChanged();
              },
            ),
            const SizedBox(height: 10),
            _FiscalField(
              key: const Key('fiscal-document'),
              hint: controller.personType == 'CNPJ' ? 'CNPJ' : 'CPF',
              initial: controller.documentMasked,
              keyboardType: TextInputType.number,
              inputFormatters: [
                BrDocumentInputFormatter(cnpj: controller.personType == 'CNPJ'),
              ],
              onChanged: (value) {
                controller.documentMasked = value;
                onChanged();
              },
            ),
            const SizedBox(height: 10),
            _FiscalField(
              key: const Key('fiscal-email'),
              hint: 'E-mail para documento fiscal',
              initial: controller.email,
              keyboardType: TextInputType.emailAddress,
              onChanged: (value) {
                controller.markEmailTouched();
                controller.email = value;
                onChanged();
              },
            ),
            const SizedBox(height: 10),
            const Text(
              'Esses dados ficarão vinculados a esta compra.',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 11,
                height: 1.35,
                color: kCreditsMuted,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Os dados informados serão usados apenas para fins fiscais relacionados a esta compra.',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 11,
                height: 1.35,
                color: kCreditsMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ChoiceChip extends StatelessWidget {
  const _ChoiceChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? kCreditsSoft : const Color(0xFFF7F7F9),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Icon(
                selected ? Icons.radio_button_checked : Icons.radio_button_off,
                color: selected ? kCreditsAccent : const Color(0xFFC9C9D0),
                size: 18,
              ),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  fontSize: 13,
                  color: kCreditsInk,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FiscalField extends StatefulWidget {
  const _FiscalField({
    super.key,
    required this.hint,
    required this.initial,
    required this.onChanged,
    this.keyboardType,
    this.inputFormatters,
  });

  final String hint;
  final String initial;
  final ValueChanged<String> onChanged;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;

  @override
  State<_FiscalField> createState() => _FiscalFieldState();
}

class _FiscalFieldState extends State<_FiscalField> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initial);
  }

  @override
  void didUpdateWidget(covariant _FiscalField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.hint != widget.hint) {
      _controller.text = widget.initial;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      keyboardType: widget.keyboardType,
      inputFormatters: widget.inputFormatters,
      style: const TextStyle(
        fontFamily: AppTheme.fontFamily,
        fontSize: 13,
        color: kCreditsInk,
      ),
      decoration: InputDecoration(
        hintText: widget.hint,
        hintStyle: const TextStyle(
          fontFamily: AppTheme.fontFamily,
          fontSize: 13,
          color: kCreditsMuted,
        ),
        filled: true,
        fillColor: const Color(0xFFF7F7F9),
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE8E8EE)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE8E8EE)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: kCreditsAccent, width: 1.4),
        ),
      ),
      onChanged: widget.onChanged,
    );
  }
}
