import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/constants/venue_categories.dart';
import '../../core/config/api_config.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_controller.dart';

class VenueEditScreen extends StatefulWidget {
  const VenueEditScreen({super.key});

  @override
  State<VenueEditScreen> createState() => _VenueEditScreenState();
}

class _VenueEditScreenState extends State<VenueEditScreen> {
  static const _accent = Color(0xFFF58634);
  static const _bg = Color(0xFFF6F8F7);
  static const _hint = Color(0xFF9A9AA3);
  static const _inputFill = Color(0xFFF7F7F8);
  static const _border = Color(0xFFE8E8EE);
  static const _inputTextStyle = TextStyle(
    fontFamily: AppTheme.fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: Color(0xFF282829),
  );

  static const _days = [
    ('mon', 'Segunda'),
    ('tue', 'Terça'),
    ('wed', 'Quarta'),
    ('thu', 'Quinta'),
    ('fri', 'Sexta'),
    ('sat', 'Sábado'),
    ('sun', 'Domingo'),
  ];

  final _name = TextEditingController();
  final _description = TextEditingController();
  final _address = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _phone = TextEditingController();
  final _instagram = TextEditingController();
  final _whatsapp = TextEditingController();
  final _coverCharge = TextEditingController();

  final Map<String, TextEditingController> _open = {};
  final Map<String, TextEditingController> _close = {};
  final Map<String, bool> _closed = {};

  String? _category;
  String? _logoUrl;
  String? _coverUrl;
  List<dynamic> _photos = [];
  bool _loading = false;
  bool _boot = true;
  String? _venueId;
  int _tab = 0;
  String _loadedCity = '';
  String _loadedState = '';
  bool _acceptsMealVoucher = false;
  bool _hasKidsSpace = false;
  bool _hasCoverCharge = false;
  bool _hasWheelchairAccess = false;

  final _picker = ImagePicker();

  List<dynamic> get _gallery => _photos
      .where((p) => (p as Map)['kind']?.toString() != 'MENU')
      .toList();

  List<dynamic> get _menu => _photos
      .where((p) => (p as Map)['kind']?.toString() == 'MENU')
      .toList();

  @override
  void initState() {
    super.initState();
    for (final (key, _) in _days) {
      _open[key] = TextEditingController(text: '10:00');
      _close[key] = TextEditingController(text: '22:00');
      _closed[key] = false;
    }
    _load();
  }

  Future<void> _load() async {
    final auth = context.read<AuthController>();
    final venueId = auth.user?.venueId;
    _venueId = venueId;
    if (venueId == null) {
      setState(() => _boot = false);
      return;
    }
    try {
      final data = await context.read<ApiClient>().get('/venues/$venueId')
          as Map<String, dynamic>;
      _name.text = data['name']?.toString() ?? '';
      _description.text = data['description']?.toString() ?? '';
      _city.text = data['city']?.toString() ?? '';
      _state.text = data['state']?.toString() ?? '';
      _loadedCity = _city.text;
      _loadedState = _state.text;
      final category = data['category']?.toString();
      _category = VenueCategories.all.contains(category) ? category : null;
      _logoUrl = data['logoUrl'] as String?;
      _coverUrl = data['coverUrl'] as String?;
      _photos = (data['photos'] as List<dynamic>?) ?? [];

      final contacts = data['contacts'];
      if (contacts is Map) {
        _phone.text = contacts['phone']?.toString() ?? '';
        _instagram.text = contacts['instagram']?.toString() ?? '';
        _whatsapp.text = contacts['whatsapp']?.toString() ?? '';
        _address.text = contacts['address']?.toString() ?? '';
        _acceptsMealVoucher = contacts['acceptsMealVoucher'] == true;
        _hasKidsSpace = contacts['hasKidsSpace'] == true;
        _hasCoverCharge = contacts['hasCoverCharge'] == true;
        _coverCharge.text = contacts['coverCharge']?.toString() ?? '';
        _hasWheelchairAccess = contacts['hasWheelchairAccess'] == true;
      }

      final hours = data['hoursJson'];
      if (hours is Map) {
        for (final (key, _) in _days) {
          final day = hours[key];
          if (day is Map) {
            _closed[key] = day['closed'] == true;
            if (day['open'] != null) _open[key]!.text = day['open'].toString();
            if (day['close'] != null) {
              _close[key]!.text = day['close'].toString();
            }
          }
        }
      }
    } finally {
      if (mounted) setState(() => _boot = false);
    }
  }

  Map<String, dynamic> _buildHours() {
    final map = <String, dynamic>{};
    for (final (key, _) in _days) {
      if (_closed[key] == true) {
        map[key] = {'closed': true};
      } else {
        map[key] = {
          'open': _open[key]!.text.trim(),
          'close': _close[key]!.text.trim(),
        };
      }
    }
    return map;
  }

  Future<String?> _pickAndUpload() async {
    final file = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      imageQuality: 85,
    );
    if (file == null) return null;
    if (!mounted) return null;
    final api = context.read<ApiClient>();
    final bytes = await file.readAsBytes();
    final uploaded = await api.uploadImage(
          bytes: bytes,
          filename: file.name,
          mimeType: file.mimeType,
        );
    return uploaded['url'] as String?;
  }

  Future<void> _uploadLogo() async {
    setState(() => _loading = true);
    try {
      final url = await _pickAndUpload();
      if (url == null) return;
      setState(() => _logoUrl = url);
    } on ApiException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _uploadCover() async {
    setState(() => _loading = true);
    try {
      final url = await _pickAndUpload();
      if (url == null) return;
      setState(() => _coverUrl = url);
    } on ApiException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addPhoto(String kind) async {
    final venueId = _venueId;
    if (venueId == null) return;
    final api = context.read<ApiClient>();
    setState(() => _loading = true);
    try {
      final url = await _pickAndUpload();
      if (url == null) return;
      if (!mounted) return;
      await api.post('/venues/$venueId/photos', body: {
        'url': url,
        'kind': kind,
      });
      await _load();
      if (!mounted) return;
      _toast(kind == 'MENU' ? 'Foto do cardápio adicionada' : 'Foto adicionada');
    } on ApiException catch (e) {
      if (!mounted) return;
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _removePhoto(Map<String, dynamic> photo) async {
    final venueId = _venueId;
    final photoId = photo['id']?.toString();
    if (venueId == null || photoId == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text(
          'Remover foto',
          style: TextStyle(fontFamily: AppTheme.fontFamily),
        ),
        content: const Text(
          'Deseja remover esta imagem?',
          style: TextStyle(fontFamily: AppTheme.fontFamily),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Remover'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _loading = true);
    try {
      await context.read<ApiClient>().delete('/venues/$venueId/photos/$photoId');
      await _load();
      if (!mounted) return;
      _toast('Foto removida');
    } on ApiException catch (e) {
      if (!mounted) return;
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    final venueId = _venueId;
    if (venueId == null) return;
    setState(() => _loading = true);
    try {
      final city = _city.text.trim();
      final state = _state.text.trim();
      await context.read<ApiClient>().put('/venues/$venueId', body: {
        'name': _name.text.trim(),
        'category': _category ?? '',
        'description': _description.text.trim(),
        'city': city,
        'state': state,
        if (_logoUrl != null) 'logoUrl': _logoUrl,
        if (_coverUrl != null) 'coverUrl': _coverUrl,
        'contacts': {
          'phone': _phone.text.trim(),
          'instagram': _instagram.text.trim(),
          'whatsapp': _whatsapp.text.trim(),
          'address': _address.text.trim(),
          'acceptsMealVoucher': _acceptsMealVoucher,
          'hasKidsSpace': _hasKidsSpace,
          'hasCoverCharge': _hasCoverCharge,
          'coverCharge': _coverCharge.text.trim(),
          'hasWheelchairAccess': _hasWheelchairAccess,
        },
        'hoursJson': _buildHours(),
      });
      final locationChanged =
          city != _loadedCity.trim() || state != _loadedState.trim();
      if (locationChanged) {
        await context.read<AuthController>().updateLocation(
          city: city,
          state: state,
        );
      }
      _loadedCity = city;
      _loadedState = state;
      if (!mounted) return;
      _toast('Local atualizado');
    } on ApiException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF1A1A1A),
        content: Text(
          msg,
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

  InputDecoration _fieldDecoration({
    required String hint,
    IconData? icon,
    bool dense = false,
  }) {
    return InputDecoration(
      hintText: hint,
      hintStyle: _inputTextStyle.copyWith(color: _hint),
      filled: true,
      fillColor: _inputFill,
      prefixIcon: icon == null ? null : Icon(icon, color: _accent, size: 20),
      contentPadding: EdgeInsets.symmetric(
        horizontal: 14,
        vertical: dense ? 10 : 14,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: _border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: _border),
      ),
      disabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: _border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: _accent, width: 1.4),
      ),
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _address.dispose();
    _city.dispose();
    _state.dispose();
    _phone.dispose();
    _instagram.dispose();
    _whatsapp.dispose();
    _coverCharge.dispose();
    for (final c in _open.values) {
      c.dispose();
    }
    for (final c in _close.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        leading: IconButton(
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          color: const Color(0xFF282829),
        ),
        title: const Text(
          'Editar estabelecimento',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w800,
            fontSize: 18,
            color: Color(0xFF282829),
          ),
        ),
      ),
      body: _boot
          ? const Center(child: CircularProgressIndicator(color: _accent))
          : Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430),
                child: Column(
                  children: [
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _LogoPicker(
                                url: _logoUrl,
                                onTap: _loading ? null : _uploadLogo,
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: _CoverPicker(
                                  url: _coverUrl,
                                  onTap: _loading ? null : _uploadCover,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 20),
                          _EditTabs(
                            index: _tab,
                            onChanged: (i) => setState(() => _tab = i),
                          ),
                          const SizedBox(height: 16),
                          if (_tab == 0) _infoTab(),
                          if (_tab == 1)
                            _PhotoManager(
                              photos: _gallery,
                              emptyLabel: 'Nenhuma foto na galeria.',
                              addLabel: 'Adicionar foto',
                              loading: _loading,
                              onAdd: () => _addPhoto('GALLERY'),
                              onRemove: _removePhoto,
                            ),
                          if (_tab == 2)
                            _PhotoManager(
                              photos: _menu,
                              emptyLabel: 'Nenhuma foto no cardápio.',
                              addLabel: 'Adicionar foto',
                              loading: _loading,
                              onAdd: () => _addPhoto('MENU'),
                              onRemove: _removePhoto,
                            ),
                          if (_tab == 3) _contactTab(),
                        ],
                      ),
                    ),
                    if (_tab == 0 || _tab == 3)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                        child: SizedBox(
                          height: 52,
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _loading ? null : _save,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.black,
                              disabledBackgroundColor: const Color(0xFFBDBDBD),
                              foregroundColor: Colors.white,
                              disabledForegroundColor: Colors.white,
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(28),
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
                                : const Text('Salvar alterações'),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _infoTab() {
    return _Card(
      child: Column(
        children: [
          TextField(
            controller: _name,
            style: _inputTextStyle,
            decoration: _fieldDecoration(
              hint: 'Nome do local',
              icon: Icons.storefront_outlined,
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _description,
            style: _inputTextStyle,
            maxLines: 3,
            decoration: _fieldDecoration(
              hint: 'Descrição',
              icon: Icons.notes_outlined,
            ),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            value: _category,
            isExpanded: true,
            style: _inputTextStyle,
            dropdownColor: Colors.white,
            decoration: _fieldDecoration(
              hint: 'Categoria',
              icon: Icons.local_offer_outlined,
            ),
            hint: Text(
              'Selecione a categoria',
              style: _inputTextStyle.copyWith(color: _hint),
            ),
            items: VenueCategories.all
                .map(
                  (item) => DropdownMenuItem(
                    value: item,
                    child: Text(item, overflow: TextOverflow.ellipsis),
                  ),
                )
                .toList(),
            onChanged: (value) => setState(() => _category = value),
          ),
          const SizedBox(height: 14),
          _AmenityCheckbox(
            value: _acceptsMealVoucher,
            label: 'Aceita vale-refeição',
            onChanged: (value) => setState(() => _acceptsMealVoucher = value),
          ),
          _AmenityCheckbox(
            value: _hasKidsSpace,
            label: 'Tem espaço kids',
            onChanged: (value) => setState(() => _hasKidsSpace = value),
          ),
          _AmenityCheckbox(
            value: _hasCoverCharge,
            label: 'Tem custo de entrada',
            onChanged: (value) => setState(() => _hasCoverCharge = value),
          ),
          if (_hasCoverCharge) ...[
            const SizedBox(height: 8),
            TextField(
              controller: _coverCharge,
              style: _inputTextStyle,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: _fieldDecoration(
                hint: 'Valor da entrada (ex: 30,00)',
                icon: Icons.payments_outlined,
              ),
            ),
          ],
          _AmenityCheckbox(
            value: _hasWheelchairAccess,
            label: 'Acessibilidade para cadeirantes',
            onChanged: (value) => setState(() => _hasWheelchairAccess = value),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _address,
            style: _inputTextStyle,
            decoration: _fieldDecoration(
              hint: 'Endereço',
              icon: Icons.signpost_outlined,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _city,
                  style: _inputTextStyle,
                  decoration: _fieldDecoration(
                    hint: 'Cidade',
                    icon: Icons.apartment_outlined,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  controller: _state,
                  style: _inputTextStyle,
                  decoration: _fieldDecoration(
                    hint: 'Estado',
                    icon: Icons.location_on_outlined,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          const Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Horário de funcionamento',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w700,
                fontSize: 14,
                color: Color(0xFF282829),
              ),
            ),
          ),
          const SizedBox(height: 8),
          for (var i = 0; i < _days.length; i++) ...[
            if (i > 0)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Divider(height: 1, color: Color(0xFFF0F0F3)),
              ),
            _HoursRow(
              label: _days[i].$2,
              closed: _closed[_days[i].$1] == true,
              openController: _open[_days[i].$1]!,
              closeController: _close[_days[i].$1]!,
              onClosedChanged: (value) => setState(
                () => _closed[_days[i].$1] = value,
              ),
              decoration: _fieldDecoration(hint: '00:00', dense: true),
            ),
          ],
        ],
      ),
    );
  }

  Widget _contactTab() {
    return _Card(
      child: Column(
        children: [
          TextField(
            controller: _phone,
            style: _inputTextStyle,
            keyboardType: TextInputType.phone,
            decoration: _fieldDecoration(
              hint: 'Reservas (telefone)',
              icon: Icons.phone_outlined,
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _whatsapp,
            style: _inputTextStyle,
            keyboardType: TextInputType.phone,
            decoration: _fieldDecoration(
              hint: 'WhatsApp',
              icon: Icons.chat_outlined,
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _instagram,
            style: _inputTextStyle,
            decoration: _fieldDecoration(
              hint: 'Instagram',
              icon: Icons.camera_alt_outlined,
            ),
          ),
        ],
      ),
    );
  }
}

class _AmenityCheckbox extends StatelessWidget {
  const _AmenityCheckbox({
    required this.value,
    required this.label,
    required this.onChanged,
  });

  final bool value;
  final String label;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => onChanged(!value),
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            SizedBox(
              width: 24,
              height: 24,
              child: Checkbox(
                value: value,
                onChanged: (next) => onChanged(next ?? false),
                activeColor: const Color(0xFFF58634),
                side: const BorderSide(color: Color(0xFFC5D4CF), width: 1.4),
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF282829),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EditTabs extends StatelessWidget {
  const _EditTabs({required this.index, required this.onChanged});

  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    const items = [
      (Icons.info_outline, 'Informações'),
      (Icons.photo_library_outlined, 'Fotos'),
      (Icons.menu_book_outlined, 'Cardápio'),
      (Icons.phone_outlined, 'Contato'),
    ];
    return Column(
      children: [
        Row(
          children: [
            for (var i = 0; i < items.length; i++)
              Expanded(
                child: InkWell(
                  onTap: () => onChanged(i),
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Column(
                      children: [
                        Icon(
                          items[i].$1,
                          size: 20,
                          color: i == index
                              ? const Color(0xFFF58634)
                              : const Color(0xFF9A9AA3),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          items[i].$2,
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontWeight: FontWeight.w700,
                            fontSize: 11,
                            color: i == index
                                ? const Color(0xFFF58634)
                                : const Color(0xFF9A9AA3),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
        Stack(
          alignment: Alignment.bottomCenter,
          children: [
            Container(height: 1, color: const Color(0xFFE8E8EE)),
            Row(
              children: [
                for (var i = 0; i < items.length; i++)
                  Expanded(
                    child: Container(
                      height: 2,
                      color: i == index
                          ? const Color(0xFFF58634)
                          : Colors.transparent,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      elevation: 2,
      shadowColor: Colors.black12,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: child,
      ),
    );
  }
}

class _LogoPicker extends StatelessWidget {
  const _LogoPicker({required this.url, required this.onTap});

  final String? url;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final resolved = ApiConfig.resolveMediaUrl(url);
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 92,
            height: 92,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFFF6F8F7),
              border: Border.all(color: const Color(0xFFC5D4CF)),
              image: resolved.isEmpty
                  ? null
                  : DecorationImage(
                      image: NetworkImage(resolved),
                      fit: BoxFit.cover,
                    ),
            ),
            child: resolved.isEmpty
                ? const Icon(Icons.add_a_photo_outlined, color: Color(0xFFF58634))
                : null,
          ),
          const SizedBox(height: 8),
          const Text(
            'Altere sua logo',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w600,
              fontSize: 12,
              color: Color(0xFFF58634),
            ),
          ),
        ],
      ),
    );
  }
}

class _CoverPicker extends StatelessWidget {
  const _CoverPicker({required this.url, required this.onTap});

  final String? url;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final resolved = ApiConfig.resolveMediaUrl(url);
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            height: 92,
            width: double.infinity,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: const Color(0xFFF6F8F7),
              border: Border.all(color: const Color(0xFFC5D4CF)),
              image: resolved.isEmpty
                  ? null
                  : DecorationImage(
                      image: NetworkImage(resolved),
                      fit: BoxFit.cover,
                    ),
            ),
            child: resolved.isEmpty
                ? const Icon(Icons.add_a_photo_outlined, color: Color(0xFFF58634))
                : null,
          ),
          const SizedBox(height: 8),
          const Text(
            'Altere sua capa',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w600,
              fontSize: 12,
              color: Color(0xFFF58634),
            ),
          ),
        ],
      ),
    );
  }
}

class _PhotoManager extends StatelessWidget {
  const _PhotoManager({
    required this.photos,
    required this.emptyLabel,
    required this.addLabel,
    required this.loading,
    required this.onAdd,
    required this.onRemove,
  });

  final List<dynamic> photos;
  final String emptyLabel;
  final String addLabel;
  final bool loading;
  final VoidCallback onAdd;
  final ValueChanged<Map<String, dynamic>> onRemove;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: 42,
          child: OutlinedButton.icon(
            onPressed: loading ? null : onAdd,
            icon: const Icon(Icons.add_photo_alternate_outlined, size: 18),
            label: Text(addLabel),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFFF58634),
              side: const BorderSide(color: Color(0xFFC5D4CF)),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
              textStyle: const TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        if (photos.isEmpty)
          Text(
            emptyLabel,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              color: Color(0xFF8B8B96),
            ),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: photos.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: 1,
              mainAxisSpacing: 1,
            ),
            itemBuilder: (context, i) {
              final photo = photos[i] as Map<String, dynamic>;
              final url = ApiConfig.resolveMediaUrl(photo['url']?.toString());
              return Stack(
                fit: StackFit.expand,
                children: [
                  Image.network(url, fit: BoxFit.cover),
                  Positioned(
                    top: 4,
                    right: 4,
                    child: Material(
                      color: Colors.black54,
                      shape: const CircleBorder(),
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: loading ? null : () => onRemove(photo),
                        child: const SizedBox(
                          width: 26,
                          height: 26,
                          child: Icon(Icons.close, size: 16, color: Colors.white),
                        ),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
      ],
    );
  }
}

class _HoursRow extends StatelessWidget {
  const _HoursRow({
    required this.label,
    required this.closed,
    required this.openController,
    required this.closeController,
    required this.onClosedChanged,
    required this.decoration,
  });

  final String label;
  final bool closed;
  final TextEditingController openController;
  final TextEditingController closeController;
  final ValueChanged<bool> onClosedChanged;
  final InputDecoration decoration;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  color: Color(0xFF282829),
                ),
              ),
            ),
            Text(
              'Fechado',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 12,
                color: closed ? const Color(0xFFF58634) : const Color(0xFF8B8B96),
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(width: 4),
            Switch(
              value: closed,
              onChanged: onClosedChanged,
              activeThumbColor: Colors.white,
              activeTrackColor: const Color(0xFFF58634),
            ),
          ],
        ),
        if (!closed)
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: openController,
                  style: const TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontSize: 13,
                    color: Color(0xFF282829),
                  ),
                  decoration: decoration.copyWith(hintText: 'Abre'),
                ),
              ),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  '–',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    color: Color(0xFF8B8B96),
                  ),
                ),
              ),
              Expanded(
                child: TextField(
                  controller: closeController,
                  style: const TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontSize: 13,
                    color: Color(0xFF282829),
                  ),
                  decoration: decoration.copyWith(hintText: 'Fecha'),
                ),
              ),
            ],
          ),
      ],
    );
  }
}
