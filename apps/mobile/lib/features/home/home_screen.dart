import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/config/api_config.dart';
import '../../core/constants/venue_categories.dart';
import '../../core/location/device_position.dart';
import '../../core/location/recent_cities_storage.dart';
import '../../core/network/api_client.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/after_logo.dart';
import '../../core/widgets/after_bottom_nav.dart';
import '../../core/widgets/expanded_image.dart';
import '../auth/auth_controller.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const _accent = Color(0xFFF58634);
  static const _bg = Color(0xFFF6F8F7);

  final _cityQuery = TextEditingController();
  final _cityFocus = FocusNode();
  final _venueQuery = TextEditingController();
  final _venueFocus = FocusNode();
  Timer? _cityDebounce;
  Timer? _venueDebounce;
  int _navIndex = 0;
  bool _showVenues = false;
  bool _pickingCity = false;
  bool _searchingCities = false;
  bool _searchingVenues = false;
  bool _loading = true;
  String? _error;
  String _selectedCity = '';
  String _selectedUf = '';
  List<dynamic> _promotions = [];
  List<dynamic> _venues = [];
  List<Map<String, dynamic>> _cityResults = [];
  List<Map<String, dynamic>> _recentCities = [];
  int _citySearchGen = 0;
  List<Map<String, dynamic>> _venueResults = [];
  final _venueFilters = _VenueSearchFilters();
  double? _originLat;
  double? _originLng;
  bool _askedLocation = false;
  late DateTime _selectedDay;

  static const _weekdayShort = [
    'Seg',
    'Ter',
    'Qua',
    'Qui',
    'Sex',
    'Sáb',
    'Dom',
  ];

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthController>().user;
    _selectedCity = user?.city ?? '';
    _selectedUf = user?.state ?? '';
    final now = DateTime.now();
    _selectedDay = DateTime(now.year, now.month, now.day);
    _bootstrapRecentCities();
    _load();
  }

  @override
  void dispose() {
    _cityDebounce?.cancel();
    _venueDebounce?.cancel();
    _cityQuery.dispose();
    _cityFocus.dispose();
    _venueQuery.dispose();
    _venueFocus.dispose();
    super.dispose();
  }

  Future<void> _ensureOrigin() async {
    if (_askedLocation) return;
    _askedLocation = true;
    final pos = await getDevicePosition();
    if (!mounted || pos == null) return;
    _originLat = pos.lat;
    _originLng = pos.lng;
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      await _ensureOrigin();
      if (!mounted) return;
      final api = context.read<ApiClient>();
      final city = _selectedCity.trim();
      final originQuery = <String, String>{
        'city': city,
        if (_originLat != null) 'lat': _originLat!.toString(),
        if (_originLng != null) 'lng': _originLng!.toString(),
      };
      final promotions = await api.get(
        '/home/promotions',
        query: {
          ...originQuery,
          'date': _dateQuery(_selectedDay),
        },
      );
      final venues = await api.get(
        '/home/venues',
        query: originQuery,
      );
      if (!mounted) return;
      final promoList = _sortOpenThenDistance(promotions as List<dynamic>? ?? []);
      final venueList = _sortOpenThenDistance(venues as List<dynamic>? ?? []);
      _stampGpsDistances(promoList, nestedVenue: true);
      _stampGpsDistances(venueList);
      setState(() {
        _promotions = promoList;
        _venues = venueList;
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

  void _stampGpsDistances(
    List<dynamic> items, {
    bool nestedVenue = false,
  }) {
    final fromLat = _originLat;
    final fromLng = _originLng;
    if (fromLat == null || fromLng == null) return;
    for (final item in items) {
      if (item is! Map) continue;
      final source = nestedVenue
          ? (item['venue'] is Map
              ? Map<String, dynamic>.from(item['venue'] as Map)
              : null)
          : item;
      if (source == null) continue;
      final lat = _distanceValue(source['lat']);
      final lng = _distanceValue(source['lng']);
      if (lat == null || lng == null) continue;
      item['distanceKm'] = _haversineKm(fromLat, fromLng, lat, lng);
    }
  }

  RecentCitiesStorage get _recentCitiesStorage {
    final userId = context.read<AuthController>().user?.id;
    return RecentCitiesStorage(userId: userId);
  }

  bool _isSameCity(String name, String uf, Map<String, dynamic> city) {
    return (city['name']?.toString() ?? '').trim().toLowerCase() ==
            name.trim().toLowerCase() &&
        (city['uf']?.toString() ?? '').trim().toLowerCase() ==
            uf.trim().toLowerCase();
  }

  List<Map<String, dynamic>> _cityPrelist() {
    final currentName = _selectedCity.trim();
    final currentUf = _selectedUf.trim();
    final list = <Map<String, dynamic>>[];
    if (currentName.isNotEmpty) {
      list.add({'name': currentName, 'uf': currentUf});
    }
    for (final city in _recentCities) {
      if (currentName.isNotEmpty &&
          _isSameCity(currentName, currentUf, city)) {
        continue;
      }
      list.add(city);
    }
    return list;
  }

  void _showCityPrelist() {
    setState(() {
      _cityResults = _cityPrelist();
      _searchingCities = false;
    });
  }

  Future<void> _bootstrapRecentCities() async {
    if (_selectedCity.trim().isNotEmpty) {
      _recentCities = await _recentCitiesStorage.remember(
        _selectedCity,
        _selectedUf,
      );
    } else {
      _recentCities = await _recentCitiesStorage.read();
    }
    if (!mounted) return;
    setState(() {});
  }

  Future<void> _rememberCity(String name, String uf) async {
    final items = await _recentCitiesStorage.remember(name, uf);
    if (!mounted) return;
    setState(() => _recentCities = items);
  }

  Future<void> _searchCities(String query) async {
    final gen = ++_citySearchGen;
    setState(() => _searchingCities = true);
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
    } on ApiException {
      if (!mounted || gen != _citySearchGen) return;
      setState(() {
        _cityResults = [];
        _searchingCities = false;
      });
    }
  }

  void _onCityQueryChanged(String value) {
    _cityDebounce?.cancel();
    if (value.trim().isEmpty) {
      _citySearchGen++;
      _showCityPrelist();
      return;
    }
    _cityDebounce = Timer(const Duration(milliseconds: 280), () {
      _searchCities(value);
    });
  }

  void _toggleCityPicker() {
    final opening = !_pickingCity;
    setState(() => _pickingCity = opening);
    if (opening) {
      _cityQuery.clear();
      _citySearchGen++;
      _showCityPrelist();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _cityFocus.requestFocus();
      });
    } else {
      _cityFocus.unfocus();
    }
  }

  void _selectCity(Map<String, dynamic> city) {
    final name = city['name']?.toString() ?? '';
    final uf = city['uf']?.toString() ?? '';
    setState(() {
      _selectedCity = name;
      _selectedUf = uf;
      _pickingCity = false;
    });
    _cityFocus.unfocus();
    _rememberCity(name, uf);
    _load();
  }

  Future<void> _searchVenues(String query) async {
    setState(() => _searchingVenues = true);
    try {
      final api = context.read<ApiClient>();
      final data = await api.get(
        '/venues/search',
        query: {
          'q': query.trim(),
          if (_venueFilters.category != null)
            'category': _venueFilters.category!,
          if (_venueFilters.minRating > 0)
            'minRating': '${_venueFilters.minRating}',
          if (_venueFilters.acceptsMealVoucher) 'acceptsMealVoucher': 'true',
          if (_venueFilters.hasKidsSpace) 'hasKidsSpace': 'true',
          if (_venueFilters.hasCoverCharge) 'hasCoverCharge': 'true',
          if (_venueFilters.hasWheelchairAccess) 'hasWheelchairAccess': 'true',
          if (_venueFilters.isPetFriendly) 'isPetFriendly': 'true',
        },
      );
      if (!mounted) return;
      final list = (data as List<dynamic>)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      setState(() {
        _venueResults = list;
        _searchingVenues = false;
      });
    } on ApiException {
      if (!mounted) return;
      setState(() {
        _venueResults = [];
        _searchingVenues = false;
      });
    }
  }

  void _onVenueQueryChanged(String value) {
    _venueDebounce?.cancel();
    _venueDebounce = Timer(const Duration(milliseconds: 280), () {
      _searchVenues(value);
    });
  }

  Future<void> _openVenueById(String id) async {
    _venueFocus.unfocus();
    final result = await Navigator.of(context).pushNamed(
      AppRoutes.venuePublic,
      arguments: {
        'venueId': id,
        'navIndex': _navIndex,
      },
    );
    if (!mounted) return;
    if (result is int) {
      _onNavTap(result);
    }
  }

  void _openVenue(Map<String, dynamic> venue) {
    final id = venue['id']?.toString();
    if (id == null || id.isEmpty) return;
    _openVenueById(id);
  }

  Future<void> _openProfile() async {
    final auth = context.read<AuthController>();
    final route = auth.user?.isVenue == true
        ? AppRoutes.venueAccount
        : AppRoutes.userProfile;
    final result = await Navigator.of(context).pushNamed(route);
    if (!mounted) return;
    if (result is int) {
      _onNavTap(result);
    }
  }

  Future<void> _openFavorites() async {
    final result = await Navigator.of(context).pushNamed(AppRoutes.favorites);
    if (!mounted) return;
    if (result is int) {
      _onNavTap(result);
    }
  }

  Future<void> _openCredits() async {
    final result = await Navigator.of(context).pushNamed(AppRoutes.credits);
    if (!mounted) return;
    if (result is int) {
      _onNavTap(result);
    }
  }

  DateTime get _today {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }

  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  String _dateQuery(DateTime day) {
    final m = day.month.toString().padLeft(2, '0');
    final d = day.day.toString().padLeft(2, '0');
    return '${day.year}-$m-$d';
  }

  String _dayChipLabel(DateTime day) {
    if (_isSameDay(day, _today)) return 'Hoje';
    final wd = _weekdayShort[day.weekday - 1];
    final d = day.day.toString().padLeft(2, '0');
    final m = day.month.toString().padLeft(2, '0');
    return '$wd $d/$m';
  }

  List<DateTime> get _promoFilterDays {
    final start = _today;
    final days = List<DateTime>.generate(
      14,
      (i) => DateTime(start.year, start.month, start.day + i),
    );
    if (!_promoFilterDaysContains(days, _selectedDay)) {
      days.add(_selectedDay);
      days.sort((a, b) => a.compareTo(b));
    }
    return days;
  }

  bool _promoFilterDaysContains(List<DateTime> days, DateTime day) =>
      days.any((d) => _isSameDay(d, day));

  void _selectPromoDay(DateTime day) {
    final next = DateTime(day.year, day.month, day.day);
    if (_isSameDay(next, _selectedDay)) return;
    setState(() {
      _selectedDay = next;
      _showVenues = false;
    });
    _load(silent: true);
  }

  Future<void> _pickPromoDay() async {
    final picked = await showDatePicker(
      context: context,
      locale: const Locale('pt', 'BR'),
      initialDate: _selectedDay.isBefore(_today) ? _today : _selectedDay,
      firstDate: _today,
      lastDate: DateTime(_today.year + 1, _today.month, _today.day),
      helpText: 'Escolher dia',
      cancelText: 'Cancelar',
      confirmText: 'Ver promoções',
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: _accent,
              onPrimary: Colors.white,
              onSurface: Color(0xFF282829),
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked == null || !mounted) return;
    _selectPromoDay(picked);
  }

  Future<void> _openVenueFilters() async {
    _venueFocus.unfocus();
    final next = await showModalBottomSheet<_VenueSearchFilters>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => _VenueFilterSheet(initial: _venueFilters.copy()),
    );
    if (next == null || !mounted) return;
    setState(() {
      _venueFilters.category = next.category;
      _venueFilters.minRating = next.minRating;
      _venueFilters.acceptsMealVoucher = next.acceptsMealVoucher;
      _venueFilters.hasKidsSpace = next.hasKidsSpace;
      _venueFilters.hasCoverCharge = next.hasCoverCharge;
      _venueFilters.hasWheelchairAccess = next.hasWheelchairAccess;
      _venueFilters.isPetFriendly = next.isPetFriendly;
    });
    _searchVenues(_venueQuery.text);
  }

  void _clearVenueFilter(void Function() clear) {
    setState(clear);
    _searchVenues(_venueQuery.text);
  }

  void _onNavTap(int index) {
    if (index == 2) {
      final isVenue = context.read<AuthController>().user?.isVenue == true;
      if (isVenue) {
        _openCredits();
      } else {
        _openFavorites();
      }
      return;
    }
    if (index == 3) {
      _openProfile();
      return;
    }
    final openingSearch = index == 1 && _navIndex != 1;
    setState(() {
      _navIndex = index;
      if (index == 0) {
        _showVenues = false;
      }
      if (index == 1) {
        _pickingCity = false;
      }
    });
    if (openingSearch) {
      _cityFocus.unfocus();
      _venueQuery.clear();
      _venueFilters.reset();
      _searchVenues('');
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _venueFocus.requestFocus();
      });
    } else if (index != 1) {
      _venueFocus.unfocus();
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthController>().user;
    final city = _selectedCity.isEmpty
        ? (user?.city ?? 'Sua cidade')
        : _selectedCity;
    final state = _selectedUf.isEmpty ? (user?.state ?? '') : _selectedUf;

    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Column(
              children: [
                Expanded(
                  child: RefreshIndicator(
                    color: _accent,
                    onRefresh: _load,
                    child: CustomScrollView(
                      slivers: [
                        SliverToBoxAdapter(
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                            child: Column(
                              children: [
                                const AfterLogo(height: 70),
                                const SizedBox(height: 2),
                                const Text(
                                  'O que temos pra hoje?',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontFamily: AppTheme.fontFamily,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 16,
                                    color: Color(0xFF282829),
                                  ),
                                ),
                                const SizedBox(height: 16),
                                _LocationPicker(
                                  city: city,
                                  state: state,
                                  expanded: _pickingCity,
                                  queryController: _cityQuery,
                                  focusNode: _cityFocus,
                                  results: _cityResults,
                                  loading: _searchingCities,
                                  onToggle: _toggleCityPicker,
                                  onQueryChanged: _onCityQueryChanged,
                                  onSelect: _selectCity,
                                ),
                                if (_navIndex == 1) ...[
                                  const SizedBox(height: 12),
                                  _VenueSearchField(
                                    controller: _venueQuery,
                                    focusNode: _venueFocus,
                                    results: _venueResults,
                                    loading: _searchingVenues,
                                    filterCount: _venueFilters.count,
                                    onQueryChanged: _onVenueQueryChanged,
                                    onSelect: _openVenue,
                                    onFiltersTap: _openVenueFilters,
                                  ),
                                  if (_venueFilters.isActive) ...[
                                    const SizedBox(height: 10),
                                    _VenueActiveFilters(
                                      filters: _venueFilters,
                                      onOpen: _openVenueFilters,
                                      onClear: _clearVenueFilter,
                                    ),
                                  ],
                                ] else ...[
                                  const SizedBox(height: 22),
                                  Row(
                                    children: [
                                      Text(
                                        _showVenues
                                            ? 'Locais em destaque'
                                            : 'Promoções/ Eventos do dia',
                                        style: const TextStyle(
                                          fontFamily: AppTheme.fontFamily,
                                          fontWeight: FontWeight.w700,
                                          fontSize: 15,
                                          color: Color(0xFF282829),
                                        ),
                                      ),
                                      const Spacer(),
                                      if (_promotions.isNotEmpty)
                                        GestureDetector(
                                          onTap: () {
                                            setState(() {
                                              _showVenues = !_showVenues;
                                            });
                                          },
                                          child: const Text(
                                            'Ver todos',
                                            style: TextStyle(
                                              fontFamily: AppTheme.fontFamily,
                                              fontWeight: FontWeight.w600,
                                              fontSize: 13,
                                              color: _accent,
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                  if (!_showVenues) ...[
                                    const SizedBox(height: 10),
                                    SizedBox(
                                      height: 36,
                                      child: Row(
                                        children: [
                                          Expanded(
                                            child: ListView.separated(
                                              scrollDirection: Axis.horizontal,
                                              itemCount: _promoFilterDays.length,
                                              separatorBuilder: (_, _) =>
                                                  const SizedBox(width: 8),
                                              itemBuilder: (context, index) {
                                                final day =
                                                    _promoFilterDays[index];
                                                final selected = _isSameDay(
                                                  day,
                                                  _selectedDay,
                                                );
                                                return GestureDetector(
                                                  onTap: () =>
                                                      _selectPromoDay(day),
                                                  child: AnimatedContainer(
                                                    duration: const Duration(
                                                      milliseconds: 180,
                                                    ),
                                                    padding:
                                                        const EdgeInsets.symmetric(
                                                      horizontal: 12,
                                                      vertical: 8,
                                                    ),
                                                    decoration: BoxDecoration(
                                                      color: selected
                                                          ? _accent
                                                          : Colors.white,
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                        18,
                                                      ),
                                                      border: Border.all(
                                                        color: selected
                                                            ? _accent
                                                            : AppTheme.sageBorder,
                                                      ),
                                                    ),
                                                    child: Text(
                                                      _dayChipLabel(day),
                                                      style: TextStyle(
                                                        fontFamily:
                                                            AppTheme.fontFamily,
                                                        fontWeight:
                                                            FontWeight.w600,
                                                        fontSize: 12,
                                                        color: selected
                                                            ? Colors.white
                                                            : const Color(
                                                                0xFF282829,
                                                              ),
                                                      ),
                                                    ),
                                                  ),
                                                );
                                              },
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          GestureDetector(
                                            onTap: _pickPromoDay,
                                            child: Container(
                                              width: 36,
                                              height: 36,
                                              decoration: BoxDecoration(
                                                color: Colors.white,
                                                borderRadius:
                                                    BorderRadius.circular(18),
                                                border: Border.all(
                                                  color: AppTheme.sageBorder,
                                                ),
                                              ),
                                              child: const Icon(
                                                Icons.calendar_today_outlined,
                                                size: 16,
                                                color: _accent,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ],
                                const SizedBox(height: 12),
                              ],
                            ),
                          ),
                        ),
                        if (_navIndex == 1)
                          const SliverToBoxAdapter(child: SizedBox(height: 24))
                        else if (_loading)
                          const SliverFillRemaining(
                            hasScrollBody: false,
                            child: Center(
                              child: CircularProgressIndicator(color: _accent),
                            ),
                          )
                        else if (_error != null)
                          SliverFillRemaining(
                            hasScrollBody: false,
                            child: Center(
                              child: Padding(
                                padding: const EdgeInsets.all(24),
                                child: Text(
                                  _error!,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontFamily: AppTheme.fontFamily,
                                  ),
                                ),
                              ),
                            ),
                          )
                        else if (_showVenues)
                          _VenueCards(
                            items: _venues,
                            onOpenVenue: _openVenueById,
                          )
                        else if (_promotions.isEmpty) ...[
                          SliverToBoxAdapter(
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(20, 8, 20, 18),
                              child: Column(
                                children: [
                                  Text(
                                    _isSameDay(_selectedDay, _today)
                                        ? 'Não há Promoções/ Eventos no dia'
                                        : 'Não há Promoções/ Eventos em ${_dayChipLabel(_selectedDay)}',
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w500,
                                      color: Color(0xFF8B8B96),
                                    ),
                                  ),
                                  const SizedBox(height: 22),
                                  const Align(
                                    alignment: Alignment.centerLeft,
                                    child: Text(
                                      'Locais da cidade',
                                      style: TextStyle(
                                        fontFamily: AppTheme.fontFamily,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 15,
                                        color: Color(0xFF282829),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          _VenueCards(
                            items: _venues,
                            onOpenVenue: _openVenueById,
                          ),
                        ] else
                          _PromotionCards(
                            items: _promotions,
                            onOpenVenue: _openVenueById,
                          ),
                      ],
                    ),
                  ),
                ),
                AfterBottomNav(
                  index: _navIndex,
                  onTap: _onNavTap,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LocationPicker extends StatelessWidget {
  const _LocationPicker({
    required this.city,
    required this.state,
    required this.expanded,
    required this.queryController,
    required this.focusNode,
    required this.results,
    required this.loading,
    required this.onToggle,
    required this.onQueryChanged,
    required this.onSelect,
  });

  final String city;
  final String state;
  final bool expanded;
  final TextEditingController queryController;
  final FocusNode focusNode;
  final List<Map<String, dynamic>> results;
  final bool loading;
  final VoidCallback onToggle;
  final ValueChanged<String> onQueryChanged;
  final ValueChanged<Map<String, dynamic>> onSelect;

  @override
  Widget build(BuildContext context) {
    final label = state.isEmpty ? city : '$city, $state';
    return Material(
      color: Colors.white,
      elevation: 3,
      shadowColor: Colors.black26,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          InkWell(
            onTap: expanded ? null : onToggle,
            borderRadius: BorderRadius.circular(20),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  const Icon(Icons.location_on, color: Color(0xFFF58634), size: 22),
                  const SizedBox(width: 10),
                  Expanded(
                    child: expanded
                        ? TextField(
                            controller: queryController,
                            focusNode: focusNode,
                            autofocus: true,
                            onChanged: onQueryChanged,
                            style: const TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              fontWeight: FontWeight.w600,
                              fontSize: 14,
                              color: Color(0xFF282829),
                            ),
                            decoration: const InputDecoration(
                              isDense: true,
                              hintText: 'Buscar cidade',
                              hintStyle: TextStyle(
                                fontFamily: AppTheme.fontFamily,
                                fontWeight: FontWeight.w400,
                                fontSize: 14,
                                color: Color(0xFF9A9AA3),
                              ),
                              border: InputBorder.none,
                              enabledBorder: InputBorder.none,
                              focusedBorder: InputBorder.none,
                              filled: false,
                              contentPadding: EdgeInsets.zero,
                            ),
                          )
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                label,
                                style: const TextStyle(
                                  fontFamily: AppTheme.fontFamily,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                  color: Color(0xFF282829),
                                ),
                              ),
                              const Text(
                                'Sua localização atual',
                                style: TextStyle(
                                  fontFamily: AppTheme.fontFamily,
                                  fontSize: 11,
                                  color: Color(0xFF9A9AA3),
                                ),
                              ),
                            ],
                          ),
                  ),
                  IconButton(
                    onPressed: onToggle,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                    icon: Icon(
                      expanded
                          ? Icons.keyboard_arrow_up_rounded
                          : Icons.keyboard_arrow_down_rounded,
                      color: const Color(0xFF9A9AA3),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (expanded) ...[
            const Divider(height: 1, color: Color(0xFFE8E8EE)),
            if (loading)
              const Padding(
                padding: EdgeInsets.all(16),
                child: SizedBox(
                  height: 22,
                  width: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.2,
                    color: Color(0xFFF58634),
                  ),
                ),
              )
            else if (results.isEmpty)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  'Nenhuma cidade encontrada.',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontSize: 13,
                    color: Color(0xFF9A9AA3),
                  ),
                ),
              )
            else
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 240),
                child: ListView.builder(
                  shrinkWrap: true,
                  padding: const EdgeInsets.only(bottom: 8),
                  itemCount: results.length,
                  itemBuilder: (context, index) {
                    final item = results[index];
                    final name = item['name']?.toString() ?? '';
                    final uf = item['uf']?.toString() ?? '';
                    return ListTile(
                      dense: true,
                      leading: const Icon(
                        Icons.location_on_outlined,
                        color: Color(0xFFF58634),
                        size: 20,
                      ),
                      title: Text(
                        uf.isEmpty ? name : '$name, $uf',
                        style: const TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF282829),
                        ),
                      ),
                      onTap: () => onSelect(item),
                    );
                  },
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _VenueSearchField extends StatelessWidget {
  const _VenueSearchField({
    required this.controller,
    required this.focusNode,
    required this.results,
    required this.loading,
    required this.filterCount,
    required this.onQueryChanged,
    required this.onSelect,
    required this.onFiltersTap,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final List<Map<String, dynamic>> results;
  final bool loading;
  final int filterCount;
  final ValueChanged<String> onQueryChanged;
  final ValueChanged<Map<String, dynamic>> onSelect;
  final VoidCallback onFiltersTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      elevation: 3,
      shadowColor: Colors.black26,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Row(
              children: [
                const Icon(Icons.search, color: Color(0xFFF58634), size: 22),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: controller,
                    focusNode: focusNode,
                    autofocus: true,
                    onChanged: onQueryChanged,
                    style: const TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                      color: Color(0xFF282829),
                    ),
                    decoration: const InputDecoration(
                      isDense: true,
                      hintText: 'Buscar local',
                      hintStyle: TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontWeight: FontWeight.w400,
                        fontSize: 14,
                        color: Color(0xFF9A9AA3),
                      ),
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      filled: false,
                      contentPadding: EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
                IconButton(
                  onPressed: onFiltersTap,
                  tooltip: 'Filtros',
                  visualDensity: VisualDensity.compact,
                  icon: Badge(
                    isLabelVisible: filterCount > 0,
                    label: Text('$filterCount'),
                    backgroundColor: const Color(0xFFF58634),
                    child: Icon(
                      filterCount > 0
                          ? Icons.tune
                          : Icons.tune_outlined,
                      color: const Color(0xFFF58634),
                      size: 22,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: Color(0xFFE8E8EE)),
          if (loading)
            const Padding(
              padding: EdgeInsets.all(16),
              child: SizedBox(
                height: 22,
                width: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2.2,
                  color: Color(0xFFF58634),
                ),
              ),
            )
          else if (results.isEmpty)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Nenhum local encontrado.',
                style: TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontSize: 13,
                  color: Color(0xFF9A9AA3),
                ),
              ),
            )
          else
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 360),
              child: ListView.builder(
                shrinkWrap: true,
                padding: const EdgeInsets.only(bottom: 8),
                itemCount: results.length,
                itemBuilder: (context, index) {
                  final item = results[index];
                  final name = item['name']?.toString() ?? '';
                  final city = item['city']?.toString() ?? '';
                  final uf = item['state']?.toString() ?? '';
                  final place = [
                    if (city.isNotEmpty) city,
                    if (uf.isNotEmpty) uf,
                  ].join(', ');
                  final category = item['category']?.toString() ?? '';
                  final avg = (item['avgRating'] as num?)?.toDouble();
                  final reviewCount = (item['reviewCount'] as num?)?.toInt() ?? 0;
                  final ratingLabel = reviewCount > 0 && avg != null
                      ? '${avg.toStringAsFixed(1).replaceAll('.', ',')} (${reviewCount})'
                      : '';
                  final subtitle = [
                    if (place.isNotEmpty) place,
                    if (category.isNotEmpty) category,
                    if (ratingLabel.isNotEmpty) ratingLabel,
                  ].join(' · ');
                  final imageUrl = ApiConfig.resolveMediaUrl(
                    item['logoUrl']?.toString() ??
                        item['coverUrl']?.toString(),
                  );
                  return ListTile(
                    dense: true,
                    leading: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: SizedBox(
                        width: 40,
                        height: 40,
                        child: imageUrl.isEmpty
                            ? const ColoredBox(
                                color: Color(0xFFEEF3F1),
                                child: Icon(
                                  Icons.storefront_outlined,
                                  color: Color(0xFFF58634),
                                  size: 20,
                                ),
                              )
                            : Image.network(
                                imageUrl,
                                fit: BoxFit.cover,
                                errorBuilder: (_, _, _) => const ColoredBox(
                                  color: Color(0xFFEEF3F1),
                                  child: Icon(
                                    Icons.storefront_outlined,
                                    color: Color(0xFFF58634),
                                    size: 20,
                                  ),
                                ),
                              ),
                      ),
                    ),
                    title: Text(
                      name,
                      style: const TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF282829),
                      ),
                    ),
                    subtitle: subtitle.isEmpty
                        ? null
                        : Text(
                            subtitle,
                            style: const TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              fontSize: 11,
                              color: Color(0xFF9A9AA3),
                            ),
                          ),
                    onTap: () => onSelect(item),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

class _PromotionCards extends StatelessWidget {
  const _PromotionCards({
    required this.items,
    required this.onOpenVenue,
  });

  final List<dynamic> items;
  final ValueChanged<String> onOpenVenue;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: Text(
            'Nenhuma promoção do dia nesta cidade.',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              color: Color(0xFF8B8B96),
            ),
          ),
        ),
      );
    }
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      sliver: SliverList.separated(
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final item = items[index] as Map<String, dynamic>;
          final venue = item['venue'] as Map<String, dynamic>? ?? {};
          return _PromoCard(
            imageUrl: ApiConfig.resolveMediaUrl(
              item['imageUrl']?.toString() ??
                  venue['coverUrl']?.toString() ??
                  venue['logoUrl']?.toString(),
            ),
            venueName: venue['name']?.toString() ?? 'Local',
            isOpen: item['isOpen'] == true,
            hasOpenInfo: item['isOpen'] != null,
            distanceLabel: _formatDistanceKm(item['distanceKm']),
            category: venue['category']?.toString() ?? '',
            dealTitle: item['title']?.toString().trim().isNotEmpty == true
                ? item['title'].toString()
                : 'Promoção do dia',
            dealDetail: item['description']?.toString() ?? '',
            validUntil: _formatDate(item['displayDate']),
            onTap: () {
              final id = venue['id']?.toString();
              if (id != null && id.isNotEmpty) {
                onOpenVenue(id);
              }
            },
            onImageTap: () => openExpandedImage(
              context,
              ApiConfig.resolveMediaUrl(
                item['imageUrl']?.toString() ??
                    venue['coverUrl']?.toString() ??
                    venue['logoUrl']?.toString(),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _VenueCards extends StatelessWidget {
  const _VenueCards({
    required this.items,
    required this.onOpenVenue,
  });

  final List<dynamic> items;
  final ValueChanged<String> onOpenVenue;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: Text(
            'Nenhum local cadastrado nesta cidade.',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              color: Color(0xFF8B8B96),
            ),
          ),
        ),
      );
    }
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      sliver: SliverList.separated(
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final venue = items[index] as Map<String, dynamic>;
          return _PromoCard(
            imageUrl: ApiConfig.resolveMediaUrl(
              venue['logoUrl']?.toString() ?? venue['coverUrl']?.toString(),
            ),
            venueName: venue['name']?.toString() ?? 'Local',
            isOpen: venue['isOpen'] == true,
            hasOpenInfo: venue['isOpen'] != null,
            distanceLabel: _formatDistanceKm(venue['distanceKm']),
            category: venue['category']?.toString() ?? '',
            dealTitle: venue['city']?.toString() ?? '',
            dealDetail: venue['description']?.toString() ?? '',
            validUntil: '',
            onTap: () {
              final id = venue['id']?.toString();
              if (id != null && id.isNotEmpty) {
                onOpenVenue(id);
              }
            },
          );
        },
      ),
    );
  }
}

class _PromoCard extends StatelessWidget {
  const _PromoCard({
    required this.imageUrl,
    required this.venueName,
    required this.isOpen,
    required this.hasOpenInfo,
    required this.category,
    required this.dealTitle,
    required this.dealDetail,
    required this.validUntil,
    required this.onTap,
    this.distanceLabel,
    this.onImageTap,
  });

  final String imageUrl;
  final String venueName;
  final bool isOpen;
  final bool hasOpenInfo;
  final String? distanceLabel;
  final String category;
  final String dealTitle;
  final String dealDetail;
  final String validUntil;
  final VoidCallback onTap;
  final VoidCallback? onImageTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 14,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        padding: const EdgeInsets.all(10),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              GestureDetector(
                onTap: onImageTap ?? onTap,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: SizedBox(
                    width: 108,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        const ColoredBox(color: Color(0xFFEEF3F1)),
                        if (imageUrl.isEmpty)
                          const Center(
                            child: Icon(
                              Icons.local_bar_outlined,
                              color: Color(0xFFF58634),
                            ),
                          )
                        else
                          Positioned.fill(
                            child: Image.network(
                              imageUrl,
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => const ColoredBox(
                                color: Color(0xFFEEF3F1),
                                child: Icon(
                                  Icons.broken_image_outlined,
                                  color: Color(0xFF9A9AA3),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: InkWell(
                  onTap: onTap,
                  borderRadius: BorderRadius.circular(12),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        venueName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          fontWeight: FontWeight.w800,
                          fontSize: 17,
                          height: 1.15,
                          color: Color(0xFF282829),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          if (hasOpenInfo)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: isOpen
                                    ? const Color(0xFF22A45A)
                                    : const Color(0xFF9A9AA3),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                isOpen ? 'Aberto' : 'Fechado',
                                style: const TextStyle(
                                  fontFamily: AppTheme.fontFamily,
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          if (hasOpenInfo &&
                              distanceLabel != null &&
                              distanceLabel!.isNotEmpty)
                            const SizedBox(width: 8),
                          if (distanceLabel != null &&
                              distanceLabel!.isNotEmpty)
                            Flexible(
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(
                                    Icons.near_me_outlined,
                                    size: 12,
                                    color: Color(0xFF8B8B96),
                                  ),
                                  const SizedBox(width: 3),
                                  Flexible(
                                    child: Text(
                                      distanceLabel!,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontFamily: AppTheme.fontFamily,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w500,
                                        color: Color(0xFF8B8B96),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                      if (category.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          category,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontSize: 11,
                            color: Color(0xFF8B8B96),
                          ),
                        ),
                      ],
                      if (dealTitle.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          dealTitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                            color: Color(0xFF282829),
                          ),
                        ),
                      ],
                      if (dealDetail.isNotEmpty)
                        Text(
                          dealDetail,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontSize: 11,
                            color: Color(0xFF8B8B96),
                            height: 1.25,
                          ),
                        ),
                      if (validUntil.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            const Icon(
                              Icons.calendar_today_outlined,
                              size: 12,
                              color: Color(0xFF9A9AA3),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'Válido para o dia $validUntil',
                              style: const TextStyle(
                                fontFamily: AppTheme.fontFamily,
                                fontSize: 10,
                                color: Color(0xFF9A9AA3),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
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

List<dynamic> _sortOpenThenDistance(List<dynamic> items) {
  final copy = [...items];
  copy.sort((a, b) {
    final ma = a is Map ? a : const <String, dynamic>{};
    final mb = b is Map ? b : const <String, dynamic>{};
    final openA = ma['isOpen'] == true ? 0 : 1;
    final openB = mb['isOpen'] == true ? 0 : 1;
    if (openA != openB) return openA - openB;
    final da = _distanceValue(ma['distanceKm']);
    final db = _distanceValue(mb['distanceKm']);
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da.compareTo(db);
  });
  return copy;
}

double? _distanceValue(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString());
}

double _haversineKm(double lat1, double lng1, double lat2, double lng2) {
  const earthKm = 6371.0;
  final dLat = _toRad(lat2 - lat1);
  final dLng = _toRad(lng2 - lng1);
  final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(_toRad(lat1)) *
          math.cos(_toRad(lat2)) *
          math.sin(dLng / 2) *
          math.sin(dLng / 2);
  return earthKm * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
}

double _toRad(double deg) => deg * math.pi / 180;

String? _formatDistanceKm(dynamic value) {
  if (value == null) return null;
  final km = value is num ? value.toDouble() : double.tryParse(value.toString());
  if (km == null || km.isNaN || km < 0) return null;
  if (km < 0.1) return '~100 m';
  if (km < 1) return '~${(km * 1000).round()} m';
  final text = km < 10 ? km.toStringAsFixed(1) : km.round().toString();
  return '~${text.replaceAll('.', ',')} km';
}

String _formatDate(dynamic value) {
  if (value == null) return '';
  final parsed = DateTime.tryParse(value.toString());
  if (parsed == null) return '';
  final d = parsed.toLocal();
  final day = d.day.toString().padLeft(2, '0');
  final month = d.month.toString().padLeft(2, '0');
  return '$day/$month/${d.year}';
}

class _VenueSearchFilters {
  String? category;
  int minRating = 0;
  bool acceptsMealVoucher = false;
  bool hasKidsSpace = false;
  bool hasCoverCharge = false;
  bool hasWheelchairAccess = false;
  bool isPetFriendly = false;

  bool get isActive => count > 0;

  int get count =>
      (category != null ? 1 : 0) +
      (minRating > 0 ? 1 : 0) +
      (acceptsMealVoucher ? 1 : 0) +
      (hasKidsSpace ? 1 : 0) +
      (hasCoverCharge ? 1 : 0) +
      (hasWheelchairAccess ? 1 : 0) +
      (isPetFriendly ? 1 : 0);

  void reset() {
    category = null;
    minRating = 0;
    acceptsMealVoucher = false;
    hasKidsSpace = false;
    hasCoverCharge = false;
    hasWheelchairAccess = false;
    isPetFriendly = false;
  }

  _VenueSearchFilters copy() {
    return _VenueSearchFilters()
      ..category = category
      ..minRating = minRating
      ..acceptsMealVoucher = acceptsMealVoucher
      ..hasKidsSpace = hasKidsSpace
      ..hasCoverCharge = hasCoverCharge
      ..hasWheelchairAccess = hasWheelchairAccess
      ..isPetFriendly = isPetFriendly;
  }
}

class _VenueActiveFilters extends StatelessWidget {
  const _VenueActiveFilters({
    required this.filters,
    required this.onOpen,
    required this.onClear,
  });

  final _VenueSearchFilters filters;
  final VoidCallback onOpen;
  final void Function(void Function() clear) onClear;

  @override
  Widget build(BuildContext context) {
    final chips = <Widget>[
      if (filters.category != null)
        _filterChip(
          filters.category!,
          () => onClear(() => filters.category = null),
        ),
      if (filters.minRating > 0)
        _filterChip(
          '${filters.minRating}+ estrelas',
          () => onClear(() => filters.minRating = 0),
        ),
      if (filters.acceptsMealVoucher)
        _filterChip(
          'Vale-refeição',
          () => onClear(() => filters.acceptsMealVoucher = false),
        ),
      if (filters.hasKidsSpace)
        _filterChip(
          'Espaço kids',
          () => onClear(() => filters.hasKidsSpace = false),
        ),
      if (filters.hasCoverCharge)
        _filterChip(
          'Custo de entrada',
          () => onClear(() => filters.hasCoverCharge = false),
        ),
      if (filters.hasWheelchairAccess)
        _filterChip(
          'Acessível',
          () => onClear(() => filters.hasWheelchairAccess = false),
        ),
      if (filters.isPetFriendly)
        _filterChip(
          'Pet friendly',
          () => onClear(() => filters.isPetFriendly = false),
        ),
    ];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        ...chips,
        GestureDetector(
          onTap: onOpen,
          child: const Text(
            'Editar',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w700,
              fontSize: 12,
              color: Color(0xFFF58634),
            ),
          ),
        ),
      ],
    );
  }

  Widget _filterChip(String label, VoidCallback onRemove) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 6, 6, 6),
      decoration: BoxDecoration(
        color: const Color(0xFFF58634),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w600,
              fontSize: 11,
              color: Colors.white,
            ),
          ),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: onRemove,
            child: const Icon(Icons.close, size: 14, color: Colors.white),
          ),
        ],
      ),
    );
  }
}

class _VenueFilterSheet extends StatefulWidget {
  const _VenueFilterSheet({required this.initial});

  final _VenueSearchFilters initial;

  @override
  State<_VenueFilterSheet> createState() => _VenueFilterSheetState();
}

class _VenueFilterSheetState extends State<_VenueFilterSheet> {
  static const _accent = Color(0xFFF58634);
  late _VenueSearchFilters _draft;

  @override
  void initState() {
    super.initState();
    _draft = widget.initial;
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + bottom),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFE8E8EE),
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Filtrar locais',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w800,
                fontSize: 18,
                color: Color(0xFF282829),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Categoria',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w700,
                fontSize: 13,
                color: Color(0xFF282829),
              ),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String?>(
              value: _draft.category,
              isExpanded: true,
              dropdownColor: Colors.white,
              decoration: InputDecoration(
                hintText: 'Todas as categorias',
                filled: true,
                fillColor: const Color(0xFFF7F7F8),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: Color(0xFFE8E8EE)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: Color(0xFFE8E8EE)),
                ),
              ),
              items: [
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('Todas as categorias'),
                ),
                ...VenueCategories.all.map(
                  (item) => DropdownMenuItem<String?>(
                    value: item,
                    child: Text(item, overflow: TextOverflow.ellipsis),
                  ),
                ),
              ],
              onChanged: (value) => setState(() => _draft.category = value),
            ),
            const SizedBox(height: 16),
            const Text(
              'Avaliação mínima',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w700,
                fontSize: 13,
                color: Color(0xFF282829),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                for (final rating in [0, 3, 4, 5])
                  GestureDetector(
                    onTap: () => setState(() => _draft.minRating = rating),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: _draft.minRating == rating
                            ? _accent
                            : Colors.white,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(
                          color: _draft.minRating == rating
                              ? _accent
                              : AppTheme.sageBorder,
                        ),
                      ),
                      child: Text(
                        rating == 0 ? 'Todas' : '$rating+',
                        style: TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                          color: _draft.minRating == rating
                              ? Colors.white
                              : const Color(0xFF282829),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            const Text(
              'Sobre o local',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w700,
                fontSize: 13,
                color: Color(0xFF282829),
              ),
            ),
            _filterCheck(
              'Aceita vale-refeição',
              _draft.acceptsMealVoucher,
              (v) => setState(() => _draft.acceptsMealVoucher = v),
            ),
            _filterCheck(
              'Tem espaço kids',
              _draft.hasKidsSpace,
              (v) => setState(() => _draft.hasKidsSpace = v),
            ),
            _filterCheck(
              'Tem custo de entrada',
              _draft.hasCoverCharge,
              (v) => setState(() => _draft.hasCoverCharge = v),
            ),
            _filterCheck(
              'Acessibilidade para cadeirantes',
              _draft.hasWheelchairAccess,
              (v) => setState(() => _draft.hasWheelchairAccess = v),
            ),
            _filterCheck(
              'Pet friendly',
              _draft.isPetFriendly,
              (v) => setState(() => _draft.isPetFriendly = v),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      setState(_draft.reset);
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF282829),
                      side: const BorderSide(color: Color(0xFFE8E8EE)),
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(24),
                      ),
                    ),
                    child: const Text(
                      'Limpar',
                      style: TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: ElevatedButton(
                    onPressed: () => Navigator.pop(context, _draft),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _accent,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(24),
                      ),
                    ),
                    child: const Text(
                      'Aplicar filtros',
                      style: TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _filterCheck(String label, bool value, ValueChanged<bool> onChanged) {
    return InkWell(
      onTap: () => onChanged(!value),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            SizedBox(
              width: 24,
              height: 24,
              child: Checkbox(
                value: value,
                onChanged: (next) => onChanged(next ?? false),
                activeColor: _accent,
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
