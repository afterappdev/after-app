import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/config/api_config.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/after_bottom_nav.dart';
import '../../core/widgets/after_logo.dart';
import 'buy_credits_screen.dart';
import 'credits_ui.dart';

class CreditsScreen extends StatefulWidget {
  const CreditsScreen({super.key});

  @override
  State<CreditsScreen> createState() => _CreditsScreenState();
}

class _CreditsScreenState extends State<CreditsScreen> {
  bool _loading = true;
  bool _uploading = false;
  bool _publishing = false;
  String? _error;
  int _balance = 0;
  List<dynamic> _history = [];
  String? _bannerUrl;
  DateTime _visibleMonth = DateTime(DateTime.now().year, DateTime.now().month);
  final Set<DateTime> _selectedDates = {};
  final _picker = ImagePicker();
  final _title = TextEditingController();
  final _description = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = context.read<ApiClient>();
      final wallet = await api.get('/credits/wallet') as Map<String, dynamic>;
      final history = await api.get('/banners/history') as List<dynamic>;
      if (!mounted) return;
      setState(() {
        _balance = wallet['balance'] as int? ?? 0;
        _history = history;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _openBuy() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const BuyCreditsScreen()),
    );
    if (mounted) await _load();
  }

  Future<void> _pickBannerImage() async {
    final file = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      imageQuality: 85,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    if (!mounted) return;
    if (bytes.length > 10 * 1024 * 1024) {
      _snack('A imagem deve ter no máximo 10MB.');
      return;
    }
    final api = context.read<ApiClient>();
    setState(() => _uploading = true);
    try {
      final uploaded = await api.uploadImage(
            bytes: bytes,
            filename: file.name,
            mimeType: file.mimeType,
          );
      if (!mounted) return;
      setState(() => _bannerUrl = uploaded['url'] as String?);
    } on ApiException catch (e) {
      if (!mounted) return;
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  void _toggleDay(DateTime day) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    if (day.isBefore(today)) return;
    setState(() {
      if (_selectedDates.any((d) => _sameDay(d, day))) {
        _selectedDates.removeWhere((d) => _sameDay(d, day));
      } else {
        _selectedDates.add(day);
      }
    });
  }

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  String _fmt(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  String _fmtBr(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  Future<void> _publishBanner() async {
    if (_bannerUrl == null) {
      _snack('Selecione uma imagem da publicação.');
      return;
    }
    final title = _title.text.trim();
    final description = _description.text.trim();
    if (title.isEmpty) {
      _snack('Informe o título da promoção.');
      return;
    }
    if (description.isEmpty) {
      _snack('Informe uma breve descrição.');
      return;
    }
    if (_selectedDates.isEmpty) {
      _snack('Selecione ao menos uma data.');
      return;
    }
    final cost = _selectedDates.length;
    if (_balance < cost) {
      _snack('Saldo insuficiente. É preciso $cost crédito(s).');
      await _openBuy();
      return;
    }

    setState(() => _publishing = true);
    try {
      final dates = _selectedDates.map(_fmt).toList()..sort();
      await context.read<ApiClient>().post('/banners', body: {
        'imageUrl': _bannerUrl,
        'dates': dates,
        'title': title,
        'description': description,
      });
      if (!mounted) return;
      setState(() {
        _bannerUrl = null;
        _selectedDates.clear();
        _title.clear();
        _description.clear();
      });
      _snack('Publicação agendada na HOME.');
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _publishing = false);
    }
  }

  void _onNavTap(int index) {
    if (index == 2) return;
    Navigator.of(context).pop(index);
  }

  @override
  Widget build(BuildContext context) {
    final sortedDates = _selectedDates.toList()..sort();
    final cost = sortedDates.length;

    return Scaffold(
      backgroundColor: kCreditsBg,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Column(
              children: [
                Expanded(
                  child: _loading
                      ? const Center(child: CircularProgressIndicator(color: kCreditsAccent))
                      : _error != null
                          ? Center(
                              child: Padding(
                                padding: const EdgeInsets.all(24),
                                child: Text(
                                  _error!,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(fontFamily: AppTheme.fontFamily),
                                ),
                              ),
                            )
                          : RefreshIndicator(
                              color: kCreditsAccent,
                              onRefresh: _load,
                              child: ListView(
                                padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
                                children: [
                                  Row(
                                    children: [
                                      Image.asset(
                                        AfterLogo.assetPath,
                                        height: 36,
                                        filterQuality: FilterQuality.high,
                                      ),
                                      const Spacer(),
                                      _CreditsBadge(balance: _balance, onTap: _openBuy),
                                    ],
                                  ),
                                  const SizedBox(height: 28),
                                  const Text(
                                    'Nova publicação',
                                    style: TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 22,
                                      color: kCreditsInk,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  const Text(
                                    'Faça o upload da sua imagem e escolha quando deseja publicar',
                                    style: TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontSize: 13,
                                      height: 1.35,
                                      color: kCreditsMuted,
                                    ),
                                  ),
                                  const SizedBox(height: 22),
                                  const Text(
                                    '1. Upload da imagem',
                                    style: TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14,
                                      color: kCreditsInk,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  GestureDetector(
                                    onTap: _uploading ? null : _pickBannerImage,
                                    child: DashedRoundedBorder(
                                      child: SizedBox(
                                        height: 168,
                                        width: double.infinity,
                                        child: ClipRRect(
                                          borderRadius: BorderRadius.circular(16),
                                          child: _uploading
                                              ? const Center(
                                                  child: CircularProgressIndicator(color: kCreditsAccent),
                                                )
                                              : _bannerUrl == null
                                                  ? const Column(
                                                      mainAxisAlignment: MainAxisAlignment.center,
                                                      children: [
                                                        Icon(Icons.cloud_upload_outlined, color: kCreditsAccent, size: 36),
                                                        SizedBox(height: 10),
                                                        Text(
                                                          'Toque para selecionar uma imagem',
                                                          style: TextStyle(
                                                            fontFamily: AppTheme.fontFamily,
                                                            fontWeight: FontWeight.w600,
                                                            fontSize: 13,
                                                            color: kCreditsInk,
                                                          ),
                                                        ),
                                                        SizedBox(height: 4),
                                                        Text(
                                                          'PNG, JPG ou JPEG • Máx. 10MB',
                                                          style: TextStyle(
                                                            fontFamily: AppTheme.fontFamily,
                                                            fontSize: 11,
                                                            color: kCreditsMuted,
                                                          ),
                                                        ),
                                                      ],
                                                    )
                                                  : Stack(
                                                      fit: StackFit.expand,
                                                      children: [
                                                        Image.network(
                                                          ApiConfig.resolveMediaUrl(_bannerUrl),
                                                          fit: BoxFit.cover,
                                                        ),
                                                        const Positioned(
                                                          right: 10,
                                                          top: 10,
                                                          child: CircleAvatar(
                                                            radius: 14,
                                                            backgroundColor: Colors.white,
                                                            child: Icon(Icons.edit_outlined, size: 16, color: kCreditsAccent),
                                                          ),
                                                        ),
                                                      ],
                                                    ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 22),
                                  const Text(
                                    '2. Título e descrição',
                                    style: TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14,
                                      color: kCreditsInk,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  CreditsField(
                                    label: 'Título da promoção',
                                    controller: _title,
                                    hint: 'Ex.: Chope em dobro até 20h',
                                    maxLength: 80,
                                  ),
                                  const SizedBox(height: 12),
                                  CreditsField(
                                    label: 'Breve descrição',
                                    controller: _description,
                                    hint: 'Conte o que o cliente vai encontrar',
                                    maxLength: 180,
                                    maxLines: 3,
                                    keyboardType: TextInputType.multiline,
                                  ),
                                  const SizedBox(height: 22),
                                  const Text(
                                    '3. Selecionar data',
                                    style: TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14,
                                      color: kCreditsInk,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  Container(
                                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(16),
                                      border: Border.all(color: const Color(0xFFE4E4EA)),
                                    ),
                                    child: Column(
                                      children: [
                                        Row(
                                          children: [
                                            const Icon(Icons.calendar_today_outlined, size: 18, color: kCreditsMuted),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: Text(
                                                sortedDates.isEmpty
                                                    ? 'Selecione a data'
                                                    : sortedDates.map(_fmtBr).join(', '),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: TextStyle(
                                                  fontFamily: AppTheme.fontFamily,
                                                  fontSize: 13,
                                                  fontWeight: sortedDates.isEmpty ? FontWeight.w500 : FontWeight.w600,
                                                  color: sortedDates.isEmpty ? kCreditsMuted : kCreditsInk,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                        const Divider(height: 20),
                                        _MonthCalendar(
                                          month: _visibleMonth,
                                          selected: _selectedDates,
                                          onPrev: () => setState(() {
                                            _visibleMonth = DateTime(_visibleMonth.year, _visibleMonth.month - 1);
                                          }),
                                          onNext: () => setState(() {
                                            _visibleMonth = DateTime(_visibleMonth.year, _visibleMonth.month + 1);
                                          }),
                                          onToggle: _toggleDay,
                                        ),
                                      ],
                                    ),
                                  ),
                                  if (cost > 0) ...[
                                    const SizedBox(height: 12),
                                    Text(
                                      'Custo: $cost crédito${cost == 1 ? '' : 's'}  •  1 crédito = 1 dia na HOME',
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                        fontFamily: AppTheme.fontFamily,
                                        fontSize: 12,
                                        color: kCreditsMuted,
                                      ),
                                    ),
                                  ],
                                  const SizedBox(height: 20),
                                  CreditsPurpleButton(
                                    label: 'Postar publicação',
                                    loading: _publishing,
                                    onPressed: _publishBanner,
                                  ),
                                  const SizedBox(height: 8),
                                  const Text(
                                    'A publicação será agendada para a data selecionada.',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontSize: 11,
                                      color: kCreditsMuted,
                                    ),
                                  ),
                                  const SizedBox(height: 28),
                                  const Text(
                                    'Publicações anteriores',
                                    style: TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 16,
                                      color: kCreditsInk,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  if (_history.isEmpty)
                                    const Padding(
                                      padding: EdgeInsets.only(top: 12),
                                      child: Text(
                                        'Nenhuma publicação ainda.',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(fontFamily: AppTheme.fontFamily, color: kCreditsMuted),
                                      ),
                                    )
                                  else
                                    ..._history.take(8).map((item) {
                                      final banner = item as Map<String, dynamic>;
                                      final schedules = (banner['schedules'] as List<dynamic>?) ?? [];
                                      final dates = schedules
                                          .map((s) => (s as Map)['displayDate']?.toString().split('T').first ?? '')
                                          .where((d) => d.isNotEmpty)
                                          .map((raw) {
                                            final p = DateTime.tryParse(raw);
                                            if (p == null) return raw;
                                            return '${p.day.toString().padLeft(2, '0')}/${p.month.toString().padLeft(2, '0')}';
                                          })
                                          .join(', ');
                                      final image = ApiConfig.resolveMediaUrl(banner['imageUrl']?.toString());
                                      return Container(
                                        margin: const EdgeInsets.only(bottom: 10),
                                        padding: const EdgeInsets.all(10),
                                        decoration: BoxDecoration(
                                          color: Colors.white,
                                          borderRadius: BorderRadius.circular(14),
                                        ),
                                        child: Row(
                                          children: [
                                            ClipRRect(
                                              borderRadius: BorderRadius.circular(8),
                                              child: image.isEmpty
                                                  ? const ColoredBox(
                                                      color: kCreditsSoft,
                                                      child: SizedBox(width: 52, height: 52, child: Icon(Icons.image_outlined)),
                                                    )
                                                  : Image.network(image, width: 52, height: 52, fit: BoxFit.cover),
                                            ),
                                            const SizedBox(width: 12),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    banner['title']?.toString().trim().isNotEmpty == true
                                                        ? banner['title'].toString()
                                                        : (dates.isEmpty ? 'Sem datas' : dates),
                                                    maxLines: 1,
                                                    overflow: TextOverflow.ellipsis,
                                                    style: const TextStyle(
                                                      fontFamily: AppTheme.fontFamily,
                                                      fontWeight: FontWeight.w700,
                                                      fontSize: 13,
                                                      color: kCreditsInk,
                                                    ),
                                                  ),
                                                  Text(
                                                    dates.isEmpty
                                                        ? 'Custo: ${banner['creditsCost']} crédito(s)'
                                                        : '$dates  •  ${banner['creditsCost']} crédito(s)',
                                                    maxLines: 1,
                                                    overflow: TextOverflow.ellipsis,
                                                    style: const TextStyle(
                                                      fontFamily: AppTheme.fontFamily,
                                                      fontSize: 12,
                                                      color: kCreditsMuted,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ],
                                        ),
                                      );
                                    }),
                                ],
                              ),
                            ),
                ),
                AfterBottomNav(index: 2, onTap: _onNavTap),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CreditsBadge extends StatelessWidget {
  const _CreditsBadge({required this.balance, required this.onTap});

  final int balance;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: kCreditsSoft,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 12, 8),
          child: Row(
            children: [
              const CircleAvatar(
                radius: 14,
                backgroundColor: kCreditsAccent,
                child: Icon(Icons.star_rounded, size: 16, color: Colors.white),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Créditos disponíveis',
                    style: TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      fontSize: 10,
                      color: kCreditsMuted,
                    ),
                  ),
                  Text(
                    '$balance',
                    style: const TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      height: 1.15,
                      color: kCreditsInk,
                    ),
                  ),
                  const Text(
                    'Comprar créditos',
                    style: TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: kCreditsAccent,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MonthCalendar extends StatelessWidget {
  const _MonthCalendar({
    required this.month,
    required this.selected,
    required this.onPrev,
    required this.onNext,
    required this.onToggle,
  });

  final DateTime month;
  final Set<DateTime> selected;
  final VoidCallback onPrev;
  final VoidCallback onNext;
  final ValueChanged<DateTime> onToggle;

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  @override
  Widget build(BuildContext context) {
    final first = DateTime(month.year, month.month, 1);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final startWeekday = first.weekday % 7;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final cells = startWeekday + daysInMonth;
    final rows = ((cells + 6) ~/ 7);

    return Column(
      children: [
        Row(
          children: [
            IconButton(
              onPressed: onPrev,
              icon: const Icon(Icons.chevron_left, color: kCreditsInk),
            ),
            Expanded(
              child: Text(
                '${kMonthNames[month.month - 1]} ${month.year}',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  color: kCreditsInk,
                ),
              ),
            ),
            IconButton(
              onPressed: onNext,
              icon: const Icon(Icons.chevron_right, color: kCreditsInk),
            ),
          ],
        ),
        const Row(
          children: [
            _Dow('D'),
            _Dow('S'),
            _Dow('T'),
            _Dow('Q'),
            _Dow('Q'),
            _Dow('S'),
            _Dow('S'),
          ],
        ),
        const SizedBox(height: 4),
        for (var r = 0; r < rows; r++)
          Row(
            children: [
              for (var c = 0; c < 7; c++)
                Expanded(
                  child: Builder(
                    builder: (_) {
                      final index = r * 7 + c;
                      final dayNum = index - startWeekday + 1;
                      if (dayNum < 1 || dayNum > daysInMonth) {
                        return const SizedBox(height: 36);
                      }
                      final date = DateTime(month.year, month.month, dayNum);
                      final isPast = date.isBefore(today);
                      final isSelected = selected.any((d) => _sameDay(d, date));
                      return GestureDetector(
                        onTap: isPast ? null : () => onToggle(date),
                        child: Container(
                          height: 36,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: isSelected ? kCreditsAccent : Colors.transparent,
                            shape: BoxShape.circle,
                          ),
                          child: Text(
                            '$dayNum',
                            style: TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              fontSize: 13,
                              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                              color: isPast
                                  ? const Color(0xFFC9C9D0)
                                  : isSelected
                                      ? Colors.white
                                      : kCreditsInk,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
            ],
          ),
      ],
    );
  }
}

class _Dow extends StatelessWidget {
  const _Dow(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(
          fontFamily: AppTheme.fontFamily,
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: kCreditsMuted,
        ),
      ),
    );
  }
}
