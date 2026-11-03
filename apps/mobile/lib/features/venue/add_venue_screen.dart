import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/validation/br_document_validator.dart';
import '../auth/auth_controller.dart';
import '../credits/fiscal_invoice_controller.dart';
import 'venue_category_dropdown_field.dart';

/// Cadastro de estabelecimento adicional para conta VENUE autenticada.
class AddVenueScreen extends StatefulWidget {
  const AddVenueScreen({super.key});

  @override
  State<AddVenueScreen> createState() => _AddVenueScreenState();
}

class _AddVenueScreenState extends State<AddVenueScreen> {
  static const _accent = Color(0xFFF58634);
  static const _purple = AppTheme.accentPurple;
  static const _inputFill = Color(0xFFF2F5F4);
  static const _hint = Color(0xFF8A9391);
  static const _border = Color(0xFFC5D4CF);
  static const _inputTextStyle = TextStyle(
    fontFamily: AppTheme.fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: Color(0xFF282829),
  );

  final _name = TextEditingController();
  final _cityQuery = TextEditingController();
  final _document = TextEditingController();

  String _documentType = 'CPF';
  String? _category;
  String? _selectedUf;
  String? _selectedCity;
  List<Map<String, dynamic>> _cityResults = [];
  bool _searchingCities = false;
  String? _locationsError;
  Timer? _cityDebounce;
  int _citySearchGen = 0;
  bool _submittedOnce = false;

  @override
  void dispose() {
    _cityDebounce?.cancel();
    _name.dispose();
    _cityQuery.dispose();
    _document.dispose();
    super.dispose();
  }

  String? _documentError() {
    final digits = BrDocumentValidator.digitsOnly(_document.text);
    if (digits.isEmpty) return 'Informe um CPF ou CNPJ.';
    if (_documentType == 'CNPJ') {
      if (!BrDocumentValidator.isValidCnpj(digits)) return 'CNPJ inválido.';
      return null;
    }
    if (!BrDocumentValidator.isValidCpf(digits)) return 'CPF inválido.';
    return null;
  }

  bool get _canSubmit {
    final auth = context.read<AuthController>();
    return _name.text.trim().length >= 2 &&
        _selectedUf != null &&
        _selectedCity != null &&
        _documentError() == null &&
        !auth.creatingOwnedVenue;
  }

  void _selectDocumentType(String type) {
    final digits = BrDocumentValidator.digitsOnly(_document.text);
    setState(() {
      _documentType = type;
      _document.text = type == 'CNPJ'
          ? BrDocumentValidator.formatCnpj(digits)
          : BrDocumentValidator.formatCpf(digits);
    });
  }

  InputDecoration _fieldDecoration({
    required String hint,
    required IconData icon,
    Widget? suffix,
  }) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(
        fontFamily: AppTheme.fontFamily,
        fontSize: 13,
        color: _hint,
      ),
      filled: true,
      fillColor: _inputFill,
      prefixIcon: Icon(icon, color: _hint, size: 20),
      suffixIcon: suffix,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: _border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: _border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: _purple, width: 1.5),
      ),
    );
  }

  Future<void> _searchCities(String query) async {
    final gen = ++_citySearchGen;
    setState(() {
      _searchingCities = true;
      _locationsError = null;
    });
    try {
      final api = context.read<ApiClient>();
      final data = await api.get(
        '/locations/cities',
        query: {'q': query.trim()},
      );
      if (!mounted || gen != _citySearchGen) return;
      final list = (data as List<dynamic>)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      setState(() {
        _cityResults = list;
        _searchingCities = false;
      });
    } on ApiException catch (e) {
      if (!mounted || gen != _citySearchGen) return;
      setState(() {
        _cityResults = [];
        _searchingCities = false;
        _locationsError = e.message;
      });
    }
  }

  void _onCityQueryChanged(String value) {
    _cityDebounce?.cancel();
    final label = _selectedCityLabel;
    if (_selectedCity != null && value.trim() == label) return;
    setState(() {
      _selectedCity = null;
      _selectedUf = null;
    });
    if (value.trim().isEmpty) {
      _citySearchGen++;
      setState(() {
        _cityResults = [];
        _searchingCities = false;
        _locationsError = null;
      });
      return;
    }
    _cityDebounce = Timer(const Duration(milliseconds: 280), () {
      _searchCities(value);
    });
  }

  String get _selectedCityLabel {
    if (_selectedCity == null || _selectedCity!.isEmpty) return '';
    final uf = _selectedUf?.trim() ?? '';
    return uf.isEmpty ? _selectedCity! : '$_selectedCity, $uf';
  }

  void _selectCity(Map<String, dynamic> city) {
    final name = city['name']?.toString().trim() ?? '';
    final uf = city['uf']?.toString().trim() ?? '';
    if (name.isEmpty) return;
    _cityDebounce?.cancel();
    _citySearchGen++;
    setState(() {
      _selectedCity = name;
      _selectedUf = uf.isEmpty ? null : uf;
      _cityResults = [];
      _searchingCities = false;
      _locationsError = null;
      _cityQuery.value = TextEditingValue(
        text: uf.isEmpty ? name : '$name, $uf',
        selection: TextSelection.collapsed(
          offset: uf.isEmpty ? name.length : '$name, $uf'.length,
        ),
      );
    });
    FocusScope.of(context).unfocus();
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF1A1A1A),
        content: Text(
          message,
          style: const TextStyle(
            fontFamily: AppTheme.fontFamily,
            color: Colors.white,
            fontSize: 14,
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (_submittedOnce && context.read<AuthController>().creatingOwnedVenue) {
      return;
    }
    final docErr = _documentError();
    if (_name.text.trim().length < 2) {
      _showSnack('Informe o nome do estabelecimento.');
      return;
    }
    if (_selectedUf == null || _selectedCity == null) {
      _showSnack('Selecione uma cidade da lista de sugestões.');
      return;
    }
    if (docErr != null) {
      _showSnack(docErr);
      return;
    }

    _submittedOnce = true;
    final auth = context.read<AuthController>();
    final result = await auth.createAdditionalOwnedVenue(
      name: _name.text,
      city: _selectedCity!,
      state: _selectedUf!,
      category: _category,
      documentType: _documentType,
      documentNumber: _document.text,
      switchToNewVenue: true,
    );

    if (!mounted) return;
    if (result.createError != null) {
      _submittedOnce = false;
      _showSnack(result.createError!);
      return;
    }

    if (result.switchWarning != null) {
      _showSnack(result.switchWarning!);
      Navigator.of(context).pop(true);
      return;
    }

    _showSnack('Estabelecimento cadastrado com sucesso.');
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final creating = context.watch<AuthController>().creatingOwnedVenue;

    return Scaffold(
      backgroundColor: const Color(0xFFF6F8F7),
      appBar: AppBar(
        backgroundColor: const Color(0xFFF6F8F7),
        elevation: 0,
        centerTitle: true,
        title: const Text(
          'Adicionar estabelecimento',
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
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            children: [
              Text(
                'Use o mesmo login para cadastrar outro local. Cada estabelecimento terá créditos, banners e dados fiscais próprios.',
                style: TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontSize: 13,
                  height: 1.35,
                  color: _purple.withValues(alpha: 0.9),
                ),
              ),
              const SizedBox(height: 20),
              TextField(
                key: const Key('add-venue-name'),
                controller: _name,
                style: _inputTextStyle,
                textCapitalization: TextCapitalization.words,
                decoration: _fieldDecoration(
                  hint: 'Nome do estabelecimento',
                  icon: Icons.storefront_outlined,
                ),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 12),
              VenueCategoryDropdownField(
                value: _category,
                optionsSeed: _category,
                style: _inputTextStyle,
                hintStyle: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontSize: 13,
                  color: _hint,
                ),
                decoration: _fieldDecoration(
                  hint: 'Categoria (opcional)',
                  icon: Icons.category_outlined,
                ),
                onChanged: (v) => setState(() => _category = v),
              ),
              const SizedBox(height: 12),
              if (_locationsError != null) ...[
                Text(
                  _locationsError!,
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    color: Theme.of(context).colorScheme.error,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 8),
              ],
              TextField(
                key: const Key('add-venue-city'),
                controller: _cityQuery,
                style: _inputTextStyle,
                textCapitalization: TextCapitalization.words,
                onChanged: _onCityQueryChanged,
                decoration: _fieldDecoration(
                  hint: 'Cidade',
                  icon: Icons.location_on_outlined,
                  suffix: _searchingCities
                      ? const Padding(
                          padding: EdgeInsets.all(12),
                          child: SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: _accent,
                            ),
                          ),
                        )
                      : null,
                ),
              ),
              if (_cityResults.isNotEmpty) ...[
                const SizedBox(height: 8),
                Material(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  child: Column(
                    children: [
                      for (final city in _cityResults.take(8))
                        ListTile(
                          key: Key('add-venue-city-${city['id']}'),
                          dense: true,
                          title: Text(
                            city['name']?.toString() ?? '',
                            style: _inputTextStyle,
                          ),
                          subtitle: Text(
                            city['uf']?.toString() ?? '',
                            style: const TextStyle(fontSize: 11, color: _hint),
                          ),
                          onTap: () => _selectCity(city),
                        ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 20),
              const Text(
                'Documento fiscal',
                style: TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                  color: Color(0xFF282829),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _DocTypeChip(
                      key: const Key('add-venue-document-cpf'),
                      label: 'CPF',
                      selected: _documentType == 'CPF',
                      onTap: () => _selectDocumentType('CPF'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _DocTypeChip(
                      key: const Key('add-venue-document-cnpj'),
                      label: 'CNPJ',
                      selected: _documentType == 'CNPJ',
                      onTap: () => _selectDocumentType('CNPJ'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('add-venue-document'),
                controller: _document,
                style: _inputTextStyle,
                keyboardType: TextInputType.number,
                inputFormatters: [
                  BrDocumentInputFormatter(cnpj: _documentType == 'CNPJ'),
                ],
                decoration: _fieldDecoration(
                  hint: _documentType == 'CNPJ'
                      ? '00.000.000/0000-00'
                      : '000.000.000-00',
                  icon: Icons.pin_outlined,
                ),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: FilledButton(
                  key: const Key('add-venue-submit'),
                  onPressed: _canSubmit && !creating ? _submit : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: _accent,
                    disabledBackgroundColor: const Color(0xFFBDBDBD),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: creating
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'Cadastrar estabelecimento',
                          style: TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DocTypeChip extends StatelessWidget {
  const _DocTypeChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  static const _purple = AppTheme.accentPurple;
  static const _accent = Color(0xFFF58634);

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? _purple : const Color(0xFFC5D4CF),
              width: selected ? 1.5 : 1,
            ),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w700,
              fontSize: 14,
              color: selected ? _accent : const Color(0xFF8A9391),
            ),
          ),
        ),
      ),
    );
  }
}
