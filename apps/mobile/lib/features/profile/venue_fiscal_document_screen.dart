import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/validation/br_document_validator.dart';
import '../credits/fiscal_invoice_controller.dart';

/// Dedicated screen for venue CPF/CNPJ (moved out of profile main view).
class VenueFiscalDocumentScreen extends StatelessWidget {
  const VenueFiscalDocumentScreen({super.key, required this.venueId});

  final String venueId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8F7),
      appBar: AppBar(
        backgroundColor: const Color(0xFFF6F8F7),
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        title: const Text(
          'Dados fiscais',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w800,
            fontSize: 18,
            color: Color(0xFF282829),
          ),
        ),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 430),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            child: VenueFiscalDocumentForm(venueId: venueId),
          ),
        ),
      ),
    );
  }
}

class VenueFiscalDocumentForm extends StatefulWidget {
  const VenueFiscalDocumentForm({super.key, required this.venueId});

  final String venueId;

  @override
  State<VenueFiscalDocumentForm> createState() => _VenueFiscalDocumentFormState();
}

class _VenueFiscalDocumentFormState extends State<VenueFiscalDocumentForm> {
  static const _accent = Color(0xFFF58634);
  final _document = TextEditingController();
  String _type = 'CPF';
  String? _savedMasked;
  bool _loading = true;
  bool _saving = false;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _document.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final data = await context.read<ApiClient>().get(
            '/venues/${widget.venueId}/fiscal-document',
          );
      if (!mounted || data is! Map) return;
      final type = data['documentType']?.toString();
      final digits = data['documentDigits']?.toString() ?? '';
      setState(() {
        _loading = false;
        if (type == 'CPF' || type == 'CNPJ') {
          _type = type!;
          _savedMasked = type == 'CNPJ'
              ? BrDocumentValidator.formatCnpj(digits)
              : BrDocumentValidator.formatCpf(digits);
        }
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = e.message;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadError = 'Não foi possível carregar o documento.';
        });
      }
    }
  }

  String? _error() {
    final digits = BrDocumentValidator.digitsOnly(_document.text);
    if (digits.isEmpty) return 'Informe um CPF ou CNPJ.';
    if (_type == 'CNPJ') {
      return BrDocumentValidator.isValidCnpj(digits) ? null : 'CNPJ inválido.';
    }
    return BrDocumentValidator.isValidCpf(digits) ? null : 'CPF inválido.';
  }

  Future<void> _save() async {
    final error = _error();
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    setState(() => _saving = true);
    try {
      final data = await context.read<ApiClient>().put(
            '/venues/${widget.venueId}/fiscal-document',
            body: {
              'documentType': _type,
              'documentNumber': BrDocumentValidator.digitsOnly(_document.text),
            },
          );
      if (!mounted) return;
      final digits = data is Map ? data['documentDigits']?.toString() ?? '' : '';
      setState(() {
        _savedMasked = _type == 'CNPJ'
            ? BrDocumentValidator.formatCnpj(digits)
            : BrDocumentValidator.formatCpf(digits);
        _document.clear();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Documento salvo com sucesso.')),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.only(top: 24),
        child: Center(
          child: CircularProgressIndicator(color: _accent),
        ),
      );
    }
    if (_loadError != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            _loadError!,
            key: const Key('venue-document-load-error'),
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 14,
              color: Color(0xFF282829),
            ),
          ),
          const SizedBox(height: 12),
          TextButton(onPressed: _load, child: const Text('Tentar novamente')),
        ],
      );
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _savedMasked == null
                ? 'Informe o CPF ou CNPJ do estabelecimento.'
                : 'Documento atual: $_savedMasked',
            key: const Key('venue-document-current'),
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 13,
              color: Color(0xFF8B8B96),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _typeButton('CPF')),
              const SizedBox(width: 8),
              Expanded(child: _typeButton('CNPJ')),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            key: const Key('venue-document-input'),
            controller: _document,
            keyboardType: TextInputType.number,
            inputFormatters: [
              BrDocumentInputFormatter(cnpj: _type == 'CNPJ'),
            ],
            decoration: InputDecoration(
              hintText: _type == 'CNPJ' ? '00.000.000/0000-00' : '000.000.000-00',
              filled: true,
              fillColor: const Color(0xFFF7F7F8),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              key: const Key('venue-document-save'),
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(backgroundColor: _accent),
              child: Text(_saving ? 'Salvando...' : 'Salvar documento'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _typeButton(String type) {
    final selected = _type == type;
    return OutlinedButton(
      onPressed: () {
        final digits = BrDocumentValidator.digitsOnly(_document.text);
        setState(() {
          _type = type;
          _document.text = type == 'CNPJ'
              ? BrDocumentValidator.formatCnpj(digits)
              : BrDocumentValidator.formatCpf(digits);
        });
      },
      style: OutlinedButton.styleFrom(
        foregroundColor: selected ? Colors.white : const Color(0xFF282829),
        backgroundColor: selected ? _accent : Colors.white,
        side: BorderSide(color: selected ? _accent : const Color(0xFFE8E8EE)),
      ),
      child: Text(type),
    );
  }
}
