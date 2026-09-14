import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/after_logo.dart';
import '../public/public_chrome.dart';
import 'auth_controller.dart';
import 'models/social_onboarding.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, this.showPublicHomeLink = false});

  /// Web `/register` and WebRoot social onboarding. Native AppStartup stays false.
  final bool showPublicHomeLink;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  static const _accent = Color(0xFFF58634);
  static const _inputFill = Color(0xFFF2F5F4);
  static const _hint = Color(0xFF8A9391);
  static const _subtitle = Color(0xFF8A9391);
  static const _border = Color(0xFFC5D4CF);
  static const _disabledButton = Color(0xFFBDBDBD);
  static const _inputTextStyle = TextStyle(
    fontFamily: AppTheme.fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: Color(0xFF282829),
  );

  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirmPassword = TextEditingController();
  final _cityQuery = TextEditingController();

  /// Exactly one role: USER or VENUE. Never both. Empty until chosen on social.
  String _role = 'USER';
  bool _loading = false;
  bool _obscurePassword = true;
  bool _obscureConfirm = true;
  SocialOnboarding? _social;
  bool _appliedSocial = false;

  List<Map<String, dynamic>> _cityResults = [];
  String? _selectedUf;
  String? _selectedCity;
  bool _searchingCities = false;
  bool _cityLookupDone = false;
  String? _locationsError;
  Timer? _cityDebounce;
  int _citySearchGen = 0;

  @override
  void initState() {
    super.initState();
    _name.addListener(_onFormChanged);
    _email.addListener(_onFormChanged);
    _password.addListener(_onFormChanged);
    _confirmPassword.addListener(_onFormChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_appliedSocial) return;
    _appliedSocial = true;
    final social = context.read<AuthController>().pendingSocialOnboarding;
    if (social == null) return;
    _social = social;
    _name.text = social.name;
    _email.text = social.email;
    _role = '';
  }

  void _onFormChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _name
      ..removeListener(_onFormChanged)
      ..dispose();
    _email
      ..removeListener(_onFormChanged)
      ..dispose();
    _password
      ..removeListener(_onFormChanged)
      ..dispose();
    _confirmPassword
      ..removeListener(_onFormChanged)
      ..dispose();
    _cityDebounce?.cancel();
    _cityQuery.dispose();
    super.dispose();
  }

  bool _isValidEmail(String email) {
    return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email);
  }

  bool get _isSocial => _social != null;

  bool get _canSubmit {
    final passwordOk = _isSocial
        ? true
        : (_password.text.length >= 6 &&
            _password.text == _confirmPassword.text);
    return _isValidEmail(_email.text.trim()) &&
        _name.text.trim().length >= 2 &&
        _selectedUf != null &&
        _selectedCity != null &&
        passwordOk &&
        (_role == 'USER' || _role == 'VENUE') &&
        !_loading;
  }

  void _selectRole(String role) {
    if (role != 'USER' && role != 'VENUE') return;
    setState(() => _role = role);
  }

  void _showErrorSnackBar(String message) {
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
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }

  String get _selectedCityLabel {
    if (_selectedCity == null || _selectedCity!.isEmpty) return '';
    final uf = _selectedUf?.trim() ?? '';
    return uf.isEmpty ? _selectedCity! : '$_selectedCity, $uf';
  }

  Future<void> _searchCities(String query) async {
    final gen = ++_citySearchGen;
    setState(() {
      _searchingCities = true;
      _cityLookupDone = false;
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
        _cityLookupDone = true;
      });
    } on ApiException catch (e) {
      if (!mounted || gen != _citySearchGen) return;
      setState(() {
        _cityResults = [];
        _searchingCities = false;
        _cityLookupDone = true;
        _locationsError = e.message;
      });
    }
  }

  void _onCityQueryChanged(String value) {
    _cityDebounce?.cancel();
    if (_selectedCity != null && value.trim() == _selectedCityLabel) {
      return;
    }
    setState(() {
      _selectedCity = null;
      _selectedUf = null;
      _cityLookupDone = false;
    });
    if (value.trim().isEmpty) {
      _citySearchGen++;
      setState(() {
        _cityResults = [];
        _searchingCities = false;
        _cityLookupDone = false;
        _locationsError = null;
      });
      return;
    }
    _cityDebounce = Timer(const Duration(milliseconds: 280), () {
      _searchCities(value);
    });
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
      _cityLookupDone = false;
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

  Future<void> _submit() async {
    final email = _email.text.trim();
    final name = _name.text.trim();
    final password = _password.text;

    if (_role != 'USER' && _role != 'VENUE') {
      _showErrorSnackBar('Selecione se você é usuário ou estabelecimento.');
      return;
    }
    if (!_isSocial) {
      if (!_isValidEmail(email) || password.length < 6) {
        _showErrorSnackBar(
          'Preencha um email válido, e a senha deverá conter no mínimo 6 caracteres.',
        );
        return;
      }
      if (password != _confirmPassword.text) {
        _showErrorSnackBar('As senhas não coincidem.');
        return;
      }
    } else if (!_isValidEmail(email)) {
      _showErrorSnackBar('E-mail da conta social indisponível. Tente entrar de novo.');
      return;
    }
    if (name.length < 2) {
      _showErrorSnackBar('Preencha o nome.');
      return;
    }
    if (_selectedUf == null || _selectedCity == null) {
      _showErrorSnackBar('Selecione uma cidade da lista de sugestões.');
      return;
    }

    setState(() => _loading = true);
    try {
      final auth = context.read<AuthController>();
      if (_social != null) {
        await auth.completeSocialRegistration(
          onboardingToken: _social!.onboardingToken,
          accountType: _role == 'VENUE' ? 'venue' : 'user',
          name: name,
          state: _selectedUf!,
          city: _selectedCity!,
        );
      } else {
        await auth.register(
          name: name,
          email: email,
          password: password,
          state: _selectedUf!,
          city: _selectedCity!,
          role: _role,
        );
      }
      if (!mounted) return;
      Navigator.of(context).popUntil((route) => route.isFirst);
    } on ApiException catch (e) {
      if (!mounted) return;
      _showErrorSnackBar(e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  InputDecoration _fieldDecoration({
    required String hint,
    required IconData icon,
    Widget? suffix,
  }) {
    final radius = BorderRadius.circular(14);
    return InputDecoration(
      hintText: hint,
      hintStyle: _inputTextStyle.copyWith(color: _hint),
      filled: true,
      fillColor: _inputFill,
      prefixIcon: Icon(icon, color: _accent, size: 22),
      suffixIcon: suffix,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: _border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: _border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: _accent, width: 1.4),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      onPopInvokedWithResult: (didPop, _) {
        if (didPop && _social != null && context.mounted) {
          context.read<AuthController>().clearPendingSocialOnboarding();
        }
      },
      child: Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        leadingWidth: widget.showPublicHomeLink ? 220 : 56,
        leading: widget.showPublicHomeLink
            ? TextButton.icon(
                key: const Key('public-home-back'),
                onPressed: () {
                  if (_social != null) {
                    context
                        .read<AuthController>()
                        .clearPendingSocialOnboarding();
                  }
                  goToPublicHome(context);
                },
                icon: const Icon(Icons.arrow_back_rounded, size: 18),
                label: const Text(PublicHomeLink.label),
              )
            : IconButton(
                onPressed: () {
                  if (_social != null) {
                    context.read<AuthController>().clearPendingSocialOnboarding();
                  }
                  Navigator.of(context).maybePop();
                },
                icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
                color: const Color(0xFF333333),
              ),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(40, 4, 40, 32),
              children: [
                const AfterLogo(height: 48),
                const SizedBox(height: 16),
                if (_social?.avatarUrl != null &&
                    _social!.avatarUrl!.isNotEmpty) ...[
                  Center(
                    child: CircleAvatar(
                      key: const Key('register-avatar'),
                      radius: 32,
                      backgroundColor: _inputFill,
                      child: ClipOval(
                        child: Image.network(
                          _social!.avatarUrl!,
                          width: 64,
                          height: 64,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => const Icon(
                            Icons.person_outline_rounded,
                            color: _accent,
                            size: 32,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                Text(
                  'Crie sua conta',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                    color: Color(0xFF282829),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.verified_user_outlined, size: 16, color: _accent),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        _isSocial
                            ? 'Escolha o tipo de conta para concluir o cadastro'
                            : 'Todos os campos são obrigatórios',
                        style: const TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          color: _subtitle,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                const Text(
                  'Tipo de conta',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: Color(0xFF282829),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _AccountTypeButton(
                        key: const Key('register-role-user'),
                        label: 'Usuário',
                        icon: Icons.person_outline_rounded,
                        selected: _role == 'USER',
                        onTap: () => _selectRole('USER'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _AccountTypeButton(
                        key: const Key('register-role-venue'),
                        label: 'Local',
                        icon: Icons.apartment_outlined,
                        selected: _role == 'VENUE',
                        onTap: () => _selectRole('VENUE'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                TextField(
                  key: const Key('register-email'),
                  controller: _email,
                  style: _inputTextStyle,
                  readOnly: _isSocial,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autofillHints: _isSocial ? null : const [AutofillHints.email],
                  decoration: _fieldDecoration(
                    hint: 'Digite seu e-mail',
                    icon: Icons.mail_outline_rounded,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  key: const Key('register-name'),
                  controller: _name,
                  style: _inputTextStyle,
                  textInputAction: TextInputAction.next,
                  textCapitalization: TextCapitalization.words,
                  decoration: _fieldDecoration(
                    hint: 'Nome ou nome do local',
                    icon: Icons.person_outline_rounded,
                  ),
                ),
                const SizedBox(height: 12),
                if (_locationsError != null) ...[
                  Text(
                    _locationsError!,
                    style: TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
                TextField(
                  key: const Key('register-city'),
                  controller: _cityQuery,
                  style: _inputTextStyle,
                  textInputAction: TextInputAction.next,
                  textCapitalization: TextCapitalization.words,
                  onChanged: _onCityQueryChanged,
                  decoration: _fieldDecoration(
                    hint: 'Digite sua cidade',
                    icon: Icons.location_on_outlined,
                    suffix: _searchingCities
                        ? const Padding(
                            padding: EdgeInsets.all(12),
                            child: SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.2,
                                color: _accent,
                              ),
                            ),
                          )
                        : _selectedCity != null
                            ? const Icon(
                                Icons.check_circle_outline_rounded,
                                color: Color(0xFF2F9E6A),
                                size: 22,
                              )
                            : null,
                  ),
                ),
                if (_cityResults.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Material(
                    color: Colors.white,
                    elevation: 2,
                    shadowColor: Colors.black12,
                    borderRadius: BorderRadius.circular(14),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 220),
                      child: ListView.separated(
                        key: const Key('register-city-suggestions'),
                        primary: false,
                        shrinkWrap: true,
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        itemCount: _cityResults.length,
                        separatorBuilder: (_, _) => const Divider(
                          height: 1,
                          color: Color(0xFFE8E8EE),
                        ),
                        itemBuilder: (context, index) {
                          final item = _cityResults[index];
                          final name = item['name']?.toString() ?? '';
                          final uf = item['uf']?.toString() ?? '';
                          final label = uf.isEmpty ? name : '$name, $uf';
                          return ListTile(
                            dense: true,
                            leading: const Icon(
                              Icons.location_on_outlined,
                              color: _accent,
                              size: 20,
                            ),
                            title: Text(
                              label,
                              style: const TextStyle(
                                fontFamily: AppTheme.fontFamily,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF282829),
                              ),
                            ),
                            onTap: () => _selectCity(item),
                          );
                        },
                      ),
                    ),
                  ),
                ] else if (_cityLookupDone &&
                    !_searchingCities &&
                    _cityQuery.text.trim().isNotEmpty &&
                    _selectedCity == null &&
                    _cityResults.isEmpty &&
                    _locationsError == null) ...[
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Text(
                      'Nenhuma cidade encontrada.',
                      style: TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontSize: 12,
                        color: _hint,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                if (!_isSocial) ...[
                  TextField(
                    key: const Key('register-password'),
                    controller: _password,
                    style: _inputTextStyle,
                    obscureText: _obscurePassword,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.newPassword],
                    decoration: _fieldDecoration(
                      hint: 'Digite sua senha',
                      icon: Icons.lock_outline_rounded,
                      suffix: IconButton(
                        onPressed: () =>
                            setState(() => _obscurePassword = !_obscurePassword),
                        icon: Icon(
                          _obscurePassword
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined,
                          color: _hint,
                          size: 22,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    key: const Key('register-confirm-password'),
                    controller: _confirmPassword,
                    style: _inputTextStyle,
                    obscureText: _obscureConfirm,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) {
                      if (_canSubmit) _submit();
                    },
                    decoration: _fieldDecoration(
                      hint: 'Confirme sua senha',
                      icon: Icons.lock_outline_rounded,
                      suffix: IconButton(
                        onPressed: () =>
                            setState(() => _obscureConfirm = !_obscureConfirm),
                        icon: Icon(
                          _obscureConfirm
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined,
                          color: _hint,
                          size: 22,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                ] else
                  const SizedBox(height: 24),
                SizedBox(
                  height: 52,
                  child: ElevatedButton(
                    key: const Key('register-submit'),
                    onPressed: _canSubmit ? _submit : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor:
                          _canSubmit ? Colors.black : _disabledButton,
                      disabledBackgroundColor: _disabledButton,
                      foregroundColor: Colors.white,
                      disabledForegroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      textStyle: const TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                      ),
                    ),
                    child: _loading
                        ? const SizedBox(
                            height: 22,
                            width: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.4,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Criar Conta'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
    );
  }
}

class _AccountTypeButton extends StatelessWidget {
  const _AccountTypeButton({
    super.key,
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const accent = Color(0xFFF58634);
    const border = Color(0xFFD1D5DB);
    const muted = Color(0xFF6B7280);

    return SizedBox(
      height: 48,
      child: Material(
        color: selected ? accent : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: selected ? accent : border,
          ),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 20,
                color: selected ? Colors.white : muted,
              ),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                  color: selected ? Colors.white : muted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
