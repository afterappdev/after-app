import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:provider/provider.dart';

import '../../core/config/api_config.dart';
import '../../core/location/device_position.dart';
import '../../core/location/open_url.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/after_bottom_nav.dart';
import '../../core/widgets/expanded_image.dart';
import '../auth/auth_controller.dart';

class VenuePublicScreen extends StatefulWidget {
  const VenuePublicScreen({
    super.key,
    required this.venueId,
    this.navIndex = 0,
  });

  final String venueId;
  final int navIndex;

  @override
  State<VenuePublicScreen> createState() => _VenuePublicScreenState();
}

class _VenuePublicScreenState extends State<VenuePublicScreen> {
  static const _accent = Color(0xFFF58634);

  Map<String, dynamic>? _venue;
  String? _error;
  bool _loading = true;
  bool _favoriting = false;
  bool _favorited = false;
  bool _descExpanded = false;
  bool _showAllPromos = false;
  bool _submittingReview = false;
  int _tab = 0;
  int _draftRating = 0;
  String? _distanceLabel;
  final _reviewCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final api = context.read<ApiClient>();
      final user = context.read<AuthController>().user;
      final city = user?.city.trim() ?? '';
      final data = await api.get(
        '/venues/${widget.venueId}',
        query: {
          if (city.isNotEmpty) 'city': city,
        },
      ) as Map<String, dynamic>;
      var favorited = false;
      try {
        final favs = await api.get('/favorites') as List<dynamic>? ?? [];
        favorited = favs.any((item) {
          final venue = (item as Map)['venue'] as Map<String, dynamic>? ?? {};
          return venue['id']?.toString() == widget.venueId;
        });
      } on ApiException {
        favorited = false;
      }
      if (!mounted) return;
      final uid = user?.id;
      final reviews = (data['reviews'] as List<dynamic>?) ?? [];
      Map<String, dynamic>? mine;
      if (uid != null) {
        for (final item in reviews) {
          final map = Map<String, dynamic>.from(item as Map);
          if (map['userId']?.toString() == uid) {
            mine = map;
            break;
          }
        }
      }
      setState(() {
        _venue = data;
        _favorited = favorited;
        _loading = false;
        _distanceLabel = _formatDistanceKm(data['distanceKm']);
        if (mine != null) {
          _draftRating = (mine['rating'] as num?)?.toInt() ?? _draftRating;
          _reviewCtrl.text = mine['testimonial']?.toString() ?? '';
        }
      });
      _refineDistance(data);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  Future<void> _refineDistance(Map<String, dynamic> venue) async {
    final lat = (venue['lat'] as num?)?.toDouble();
    final lng = (venue['lng'] as num?)?.toDouble();
    if (lat == null || lng == null) return;
    final pos = await getDevicePosition();
    if (!mounted || pos == null) return;
    setState(() {
      _distanceLabel = _formatDistanceKm(_haversineKm(pos.lat, pos.lng, lat, lng));
    });
  }

  Future<void> _toggleFavorite() async {
    final auth = context.read<AuthController>();
    if (auth.user?.isVenue == true) return;
    setState(() => _favoriting = true);
    try {
      final api = context.read<ApiClient>();
      if (_favorited) {
        await api.delete('/favorites/${widget.venueId}');
      } else {
        await api.post('/favorites/${widget.venueId}');
      }
      if (!mounted) return;
      setState(() => _favorited = !_favorited);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _favoriting = false);
    }
  }

  void _openMap() {
    final lat = (_venue?['lat'] as num?)?.toDouble();
    final lng = (_venue?['lng'] as num?)?.toDouble();
    final city = _venue?['city']?.toString() ?? '';
    final state = _venue?['state']?.toString() ?? '';
    final query = (lat != null && lng != null)
        ? '$lat,$lng'
        : Uri.encodeComponent('$city $state Brasil');
    openExternalUrl('https://www.google.com/maps/search/?api=1&query=$query');
  }

  void _onNavTap(int index) {
    Navigator.of(context).pop(index);
  }

  Future<void> _submitReview() async {
    final auth = context.read<AuthController>();
    if (auth.user == null || auth.user!.isVenue) return;
    if (_draftRating < 1) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Escolha uma nota de 1 a 5 estrelas.')),
      );
      return;
    }
    setState(() => _submittingReview = true);
    try {
      final api = context.read<ApiClient>();
      final data = await api.post(
        '/venues/${widget.venueId}/reviews',
        body: {
          'rating': _draftRating,
          'testimonial': _reviewCtrl.text.trim(),
        },
      ) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _venue = {
          ...?_venue,
          'avgRating': data['avgRating'],
          'reviewCount': data['reviewCount'],
          'reviews': data['reviews'],
        };
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Avaliação publicada.')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _submittingReview = false);
    }
  }

  @override
  void dispose() {
    _reviewCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isUser = context.watch<AuthController>().user?.isVenue != true;
    final session = context.watch<AuthController>().user;
    final canReview = session != null && session.isVenue != true;
    final cover = ApiConfig.resolveMediaUrl(_venue?['coverUrl']?.toString());
    final logo = ApiConfig.resolveMediaUrl(_venue?['logoUrl']?.toString());
    final name = _venue?['name']?.toString() ?? 'Local';
    final category = _venue?['category']?.toString() ?? '';
    final description = _venue?['description']?.toString() ?? '';
    final city = _venue?['city']?.toString() ?? '';
    final state = _venue?['state']?.toString() ?? '';
    final isOpen = _venue?['isOpen'] == true;
    final hasOpenInfo = _venue?['isOpen'] != null;
    final banners = (_venue?['banners'] as List<dynamic>?) ?? [];
    final photos = (_venue?['photos'] as List<dynamic>?) ?? [];
    final reviews = (_venue?['reviews'] as List<dynamic>?) ?? [];
    final avgRating = (_venue?['avgRating'] as num?)?.toDouble();
    final reviewCount = (_venue?['reviewCount'] as num?)?.toInt() ?? 0;
    final gallery = photos
        .where((p) => (p as Map)['kind']?.toString() != 'MENU')
        .toList();
    final menu = photos
        .where((p) => (p as Map)['kind']?.toString() == 'MENU')
        .toList();
    final contacts = _venue?['contacts'];

    return Scaffold(
      backgroundColor: const Color(0xFFF6F8F7),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: ColoredBox(
              color: Colors.white,
              child: Column(
                children: [
                  Expanded(
                    child: _loading
                        ? const Center(
                            child: CircularProgressIndicator(color: _accent),
                          )
                        : _error != null
                            ? Center(child: Text(_error!))
                            : CustomScrollView(
                                slivers: [
                                  SliverToBoxAdapter(
                                    child: Column(
                                      children: [
                                        _Header(
                                          cover: cover,
                                          logo: logo,
                                          name: name,
                                          category: category,
                                          isOpen: isOpen,
                                          hasOpenInfo: hasOpenInfo,
                                          distanceLabel: _distanceLabel,
                                          avgRating: avgRating,
                                          reviewCount: reviewCount,
                                          isUser: isUser,
                                          favorited: _favorited,
                                          favoriting: _favoriting,
                                          onBack: () =>
                                              Navigator.of(context).maybePop(),
                                          onFavorite: _toggleFavorite,
                                        ),
                                        Padding(
                                          padding: const EdgeInsets.fromLTRB(
                                            20,
                                            8,
                                            20,
                                            0,
                                          ),
                                          child: Column(
                                            children: [
                                              if (description.isNotEmpty) ...[
                                                _ExpandableText(
                                                  text: description,
                                                  expanded: _descExpanded,
                                                  onToggle: () => setState(
                                                    () => _descExpanded =
                                                        !_descExpanded,
                                                  ),
                                                ),
                                                const SizedBox(height: 20),
                                              ],
                                              _Tabs(
                                                index: _tab,
                                                onChanged: (i) =>
                                                    setState(() => _tab = i),
                                              ),
                                              const SizedBox(height: 20),
                                            ],
                                          ),
                                        ),
                                        Padding(
                                          padding: EdgeInsets.fromLTRB(
                                            _tab == 1 ? 0 : 20,
                                            0,
                                            _tab == 1 ? 0 : 20,
                                            28,
                                          ),
                                          child: _tab == 0
                                              ? _AboutTab(
                                                  city: city,
                                                  state: state,
                                                  contacts: contacts,
                                                  banners: banners,
                                                  hoursJson:
                                                      _venue?['hoursJson'],
                                                  showAllPromos: _showAllPromos,
                                                  onTogglePromos: () =>
                                                      setState(
                                                    () => _showAllPromos =
                                                        !_showAllPromos,
                                                  ),
                                                  onOpenMap: _openMap,
                                                  onOpenImage: (url) =>
                                                      openExpandedImage(
                                                    context,
                                                    url,
                                                  ),
                                                )
                                              : _tab == 1
                                                  ? _PhotoGrid(
                                                      photos: gallery,
                                                      emptyLabel:
                                                          'Nenhuma foto do local ainda.',
                                                    )
                                                  : _tab == 2
                                                      ? _PhotoGrid(
                                                          photos: menu,
                                                          emptyLabel:
                                                              'Cardápio ainda não publicado.',
                                                        )
                                                      : _tab == 3
                                                          ? _ReviewsTab(
                                                              reviews: reviews,
                                                              canReview:
                                                                  canReview,
                                                              showLoginHint:
                                                                  session ==
                                                                      null,
                                                              rating:
                                                                  _draftRating,
                                                              commentCtrl:
                                                                  _reviewCtrl,
                                                              submitting:
                                                                  _submittingReview,
                                                              alreadyReviewed:
                                                                  reviews.any(
                                                                (item) =>
                                                                    (item as Map)['userId']
                                                                        ?.toString() ==
                                                                    session?.id,
                                                              ),
                                                              onRating: (value) =>
                                                                  setState(
                                                                () =>
                                                                    _draftRating =
                                                                        value,
                                                              ),
                                                              onSubmit:
                                                                  _submitReview,
                                                            )
                                                          : _ContactTab(
                                                              contacts:
                                                                  contacts,
                                                            ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                  ),
                  AfterBottomNav(
                    index: widget.navIndex,
                    onTap: _onNavTap,
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

class _Header extends StatelessWidget {
  const _Header({
    required this.cover,
    required this.logo,
    required this.name,
    required this.category,
    required this.isOpen,
    required this.hasOpenInfo,
    required this.distanceLabel,
    required this.avgRating,
    required this.reviewCount,
    required this.isUser,
    required this.favorited,
    required this.favoriting,
    required this.onBack,
    required this.onFavorite,
  });

  final String cover;
  final String logo;
  final String name;
  final String category;
  final bool isOpen;
  final bool hasOpenInfo;
  final String? distanceLabel;
  final double? avgRating;
  final int reviewCount;
  final bool isUser;
  final bool favorited;
  final bool favoriting;
  final VoidCallback onBack;
  final VoidCallback onFavorite;

  static const _coverHeight = 196.0;
  static const _logoSize = 116.0;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: _coverHeight,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              GestureDetector(
                onTap: cover.isEmpty ? null : () => openExpandedImage(context, cover),
                child: SizedBox(
                  height: _coverHeight,
                  width: double.infinity,
                  child: cover.isEmpty
                      ? const ColoredBox(color: Color(0xFFEEF3F1))
                      : Image.network(cover, fit: BoxFit.cover),
                ),
              ),
              Positioned(
                top: MediaQuery.of(context).padding.top + 8,
                left: 12,
                child: _RoundIcon(icon: Icons.arrow_back_ios_new_rounded, onTap: onBack),
              ),
              if (isUser)
                Positioned(
                  top: _coverHeight - 38 - 12,
                  right: 12,
                  child: _RoundIcon(
                    icon: favorited ? Icons.favorite : Icons.favorite_border,
                    iconColor: favorited ? const Color(0xFFF58634) : const Color(0xFF333333),
                    onTap: favoriting ? null : onFavorite,
                  ),
                ),
              Positioned(
                left: 16,
                bottom: -(_logoSize / 2),
                child: GestureDetector(
                  onTap: logo.isEmpty ? null : () => openExpandedImage(context, logo),
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                    child: CircleAvatar(
                      radius: 54,
                      backgroundColor: const Color(0xFFE8F0ED),
                      backgroundImage: logo.isEmpty ? null : NetworkImage(logo),
                      child: logo.isEmpty
                          ? const Icon(Icons.storefront, color: Color(0xFFF58634), size: 36)
                          : null,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16 + _logoSize + 10, 10, 16, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    name,
                    textAlign: TextAlign.left,
                    style: const TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      fontWeight: FontWeight.w800,
                      fontSize: 22,
                      height: 1.1,
                      color: Color(0xFF282829),
                    ),
                  ),
                  _AvgStars(
                    value: avgRating ?? 0,
                    count: reviewCount,
                    size: 16,
                    showNumber: true,
                  ),
                ],
              ),
              const SizedBox(height: 2),
              Row(
                children: [
                  if (hasOpenInfo)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                      decoration: BoxDecoration(
                        color: isOpen
                            ? const Color(0xFFE6F6EC)
                            : const Color(0xFFF0F0F3),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        isOpen ? 'Aberto' : 'Fechado',
                        style: TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          color: isOpen
                              ? const Color(0xFF22A45A)
                              : const Color(0xFF8B8B96),
                          fontSize: 11,
                          height: 1.1,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  if (hasOpenInfo && distanceLabel != null)
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 8),
                      child: Text(
                        '•',
                        style: TextStyle(color: Color(0xFF8B8B96), fontSize: 12, height: 1.1),
                      ),
                    ),
                  if (distanceLabel != null)
                    Flexible(
                      child: Text(
                        distanceLabel!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          fontSize: 12,
                          height: 1.1,
                          color: Color(0xFF8B8B96),
                        ),
                      ),
                    ),
                ],
              ),
              if (category.isNotEmpty) ...[
                const SizedBox(height: 1),
                Text(
                  category,
                  textAlign: TextAlign.left,
                  style: const TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontSize: 12,
                    height: 1.1,
                    color: Color(0xFF8B8B96),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _RoundIcon extends StatelessWidget {
  const _RoundIcon({
    required this.icon,
    required this.onTap,
    this.iconColor = const Color(0xFF333333),
  });

  final IconData icon;
  final VoidCallback? onTap;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(),
      elevation: 2,
      shadowColor: Colors.black26,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 38,
          height: 38,
          child: Icon(icon, size: 18, color: iconColor),
        ),
      ),
    );
  }
}

class _ExpandableText extends StatelessWidget {
  const _ExpandableText({
    required this.text,
    required this.expanded,
    required this.onToggle,
  });

  final String text;
  final bool expanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    const body = TextStyle(
      fontFamily: AppTheme.fontFamily,
      fontSize: 13,
      height: 1.45,
      color: Color(0xFF6B6B75),
    );
    const link = TextStyle(
      fontFamily: AppTheme.fontFamily,
      fontWeight: FontWeight.w700,
      fontSize: 13,
      height: 1.45,
      color: Color(0xFFF58634),
    );
    final collapsed = !expanded && text.length > 90;
    final visible = collapsed ? '${text.substring(0, 90).trimRight()}... ' : '$text ';
    return Text.rich(
      TextSpan(
        style: body,
        children: [
          TextSpan(text: visible),
          if (text.length > 90)
            WidgetSpan(
              alignment: PlaceholderAlignment.baseline,
              baseline: TextBaseline.alphabetic,
              child: GestureDetector(
                onTap: onToggle,
                child: Text(expanded ? 'Ver menos' : 'Ver mais', style: link),
              ),
            ),
        ],
      ),
      textAlign: TextAlign.center,
    );
  }
}

class _Tabs extends StatelessWidget {
  const _Tabs({required this.index, required this.onChanged});

  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    const items = [
      (Icons.info_outline, 'Sobre'),
      (Icons.photo_library_outlined, 'Fotos do local'),
      (Icons.menu_book_outlined, 'Cardápio'),
      (Icons.star_outline_rounded, 'Avaliações'),
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
                          size: 22,
                          color: i == index ? const Color(0xFFF58634) : const Color(0xFF9A9AA3),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          items[i].$2,
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontWeight: FontWeight.w700,
                            fontSize: 11,
                            height: 1.15,
                            color: i == index ? const Color(0xFFF58634) : const Color(0xFF9A9AA3),
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
                      color: i == index ? const Color(0xFFF58634) : Colors.transparent,
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

class _AboutTab extends StatelessWidget {
  const _AboutTab({
    required this.city,
    required this.state,
    required this.contacts,
    required this.banners,
    required this.hoursJson,
    required this.showAllPromos,
    required this.onTogglePromos,
    required this.onOpenMap,
    required this.onOpenImage,
  });

  final String city;
  final String state;
  final dynamic contacts;
  final List<dynamic> banners;
  final dynamic hoursJson;
  final bool showAllPromos;
  final VoidCallback onTogglePromos;
  final VoidCallback onOpenMap;
  final ValueChanged<String> onOpenImage;

  @override
  Widget build(BuildContext context) {
    final visiblePromos = showAllPromos ? banners : banners.take(1).toList();
    final street = contacts is Map ? (contacts as Map)['address']?.toString() : null;
    final cityLine = [
      if (city.isNotEmpty) city,
      if (state.isNotEmpty) state,
    ].join(', ');
    final contactMap = contacts is Map ? Map<String, dynamic>.from(contacts as Map) : <String, dynamic>{};
    final acceptsMealVoucher = contactMap['acceptsMealVoucher'] == true;
    final hasKidsSpace = contactMap['hasKidsSpace'] == true;
    final hasCoverCharge = contactMap['hasCoverCharge'] == true;
    final coverCharge = contactMap['coverCharge']?.toString().trim() ?? '';
    final hasWheelchairAccess = contactMap['hasWheelchairAccess'] == true;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(
          title: 'Promoções em destaque',
          action: banners.length > 1 ? (showAllPromos ? 'Ver menos' : 'Ver todas') : null,
          onAction: banners.length > 1 ? onTogglePromos : null,
        ),
        const SizedBox(height: 12),
        if (visiblePromos.isEmpty)
          const Text(
            'Nenhuma promoção publicada ainda.',
            style: TextStyle(fontFamily: AppTheme.fontFamily, color: Color(0xFF8B8B96)),
          )
        else
          ...visiblePromos.map((item) {
            final banner = item as Map<String, dynamic>;
            final schedules = (banner['schedules'] as List<dynamic>?) ?? [];
            final date = schedules.isNotEmpty
                ? (schedules.first as Map)['displayDate']
                : null;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _PromoRow(
                imageUrl: ApiConfig.resolveMediaUrl(banner['imageUrl']?.toString()),
                title: banner['title']?.toString().isNotEmpty == true
                    ? banner['title'].toString()
                    : 'Promoção do dia',
                detail: banner['description']?.toString() ?? '',
                validUntil: _formatDate(date),
                onImageTap: () {
                  final url = ApiConfig.resolveMediaUrl(banner['imageUrl']?.toString());
                  onOpenImage(url);
                },
              ),
            );
          }),
        const _SectionDivider(),
        _AmenityInfoRow(
          icon: Icons.confirmation_number_outlined,
          title: 'Vale-refeição',
          detail: acceptsMealVoucher ? 'Aceita' : 'Não aceita',
        ),
        const SizedBox(height: 12),
        _AmenityInfoRow(
          icon: Icons.child_care_outlined,
          title: 'Espaço kids',
          detail: hasKidsSpace ? 'Tem espaço kids' : 'Não possui',
        ),
        const SizedBox(height: 12),
        _AmenityInfoRow(
          icon: Icons.payments_outlined,
          title: 'Custo de entrada',
          detail: hasCoverCharge
              ? (coverCharge.isEmpty
                  ? 'Tem custo de entrada'
                  : (coverCharge.toLowerCase().startsWith('r\$')
                      ? coverCharge
                      : 'R\$ $coverCharge'))
              : 'Não tem custo de entrada',
        ),
        const SizedBox(height: 12),
        _AmenityInfoRow(
          icon: Icons.accessible,
          title: 'Acessibilidade',
          detail: hasWheelchairAccess
              ? 'Acessível para cadeirantes'
              : 'Não informado para cadeirantes',
        ),
        const _SectionDivider(),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.only(top: 2),
              child: Icon(Icons.location_on, color: Color(0xFFF58634), size: 22),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Endereço',
                    style: TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      color: Color(0xFF282829),
                    ),
                  ),
                  const SizedBox(height: 2),
                  if (street != null && street.isNotEmpty)
                    Text(
                      street,
                      style: const TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontSize: 13,
                        height: 1.35,
                        color: Color(0xFF8B8B96),
                      ),
                    ),
                  Text(
                    cityLine.isEmpty ? 'Endereço não informado' : cityLine,
                    style: const TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      fontSize: 13,
                      height: 1.35,
                      color: Color(0xFF8B8B96),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton.icon(
              onPressed: onOpenMap,
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFFF58634),
                side: const BorderSide(color: Color(0xFFC5D4CF)),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
                textStyle: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
              icon: const Icon(Icons.open_in_new, size: 14),
              label: const Text('Ver no mapa'),
            ),
          ],
        ),
        const _SectionDivider(),
        const Row(
          children: [
            Icon(Icons.schedule, color: Color(0xFFF58634), size: 22),
            SizedBox(width: 8),
            Text(
              'Horário de funcionamento',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w700,
                fontSize: 14,
                color: Color(0xFF282829),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        ..._hoursRows(hoursJson),
      ],
    );
  }
}

class _AmenityInfoRow extends StatelessWidget {
  const _AmenityInfoRow({
    required this.icon,
    required this.title,
    required this.detail,
  });

  final IconData icon;
  final String title;
  final String detail;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Icon(icon, color: const Color(0xFFF58634), size: 22),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  color: Color(0xFF282829),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                detail,
                style: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontSize: 13,
                  height: 1.35,
                  color: Color(0xFF8B8B96),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SectionDivider extends StatelessWidget {
  const _SectionDivider();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 20),
      child: Divider(height: 1, thickness: 1, color: Color(0xFFF0F0F3)),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.action, this.onAction});

  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          title,
          style: const TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w700,
            fontSize: 15,
            color: Color(0xFF282829),
          ),
        ),
        const Spacer(),
        if (action != null)
          GestureDetector(
            onTap: onAction,
            child: Text(
              action!,
              style: const TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w600,
                fontSize: 13,
                color: Color(0xFFF58634),
              ),
            ),
          ),
      ],
    );
  }
}

class _PromoRow extends StatelessWidget {
  const _PromoRow({
    required this.imageUrl,
    required this.title,
    required this.detail,
    required this.validUntil,
    required this.onImageTap,
  });

  final String imageUrl;
  final String title;
  final String detail;
  final String validUntil;
  final VoidCallback onImageTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE8E8EE)),
      ),
      padding: const EdgeInsets.all(8),
      child: Row(
        children: [
          GestureDetector(
            onTap: imageUrl.isEmpty ? null : onImageTap,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: SizedBox(
                width: 76,
                height: 76,
                child: imageUrl.isEmpty
                    ? const ColoredBox(
                        color: Color(0xFFEEF3F1),
                        child: Icon(Icons.local_offer_outlined, color: Color(0xFFF58634)),
                      )
                    : Image.network(imageUrl, fit: BoxFit.cover),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: Color(0xFF282829),
                  ),
                ),
                if (detail.isNotEmpty)
                  Text(
                    detail,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      fontSize: 11,
                      color: Color(0xFF8B8B96),
                    ),
                  ),
                if (validUntil.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.calendar_today_outlined, size: 12, color: Color(0xFF9A9AA3)),
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
          const Icon(Icons.chevron_right_rounded, color: Color(0xFFB0B0B8)),
        ],
      ),
    );
  }
}

class _PhotoGrid extends StatelessWidget {
  const _PhotoGrid({required this.photos, required this.emptyLabel});

  final List<dynamic> photos;
  final String emptyLabel;

  @override
  Widget build(BuildContext context) {
    if (photos.isEmpty) {
      return Text(
        emptyLabel,
        textAlign: TextAlign.center,
        style: const TextStyle(fontFamily: AppTheme.fontFamily, color: Color(0xFF8B8B96)),
      );
    }
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      itemCount: photos.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 1,
        mainAxisSpacing: 1,
      ),
      itemBuilder: (context, i) {
        final url = ApiConfig.resolveMediaUrl((photos[i] as Map)['url']?.toString());
        return GestureDetector(
          onTap: url.isEmpty ? null : () => openExpandedImage(context, url),
          child: url.isEmpty
              ? const ColoredBox(color: Color(0xFFEEF3F1))
              : Image.network(url, fit: BoxFit.cover),
        );
      },
    );
  }
}

class _AvgStars extends StatelessWidget {
  const _AvgStars({
    required this.value,
    this.count = 0,
    this.size = 18,
    this.showNumber = false,
    this.onChanged,
  });

  final double value;
  final int count;
  final double size;
  final bool showNumber;
  final ValueChanged<int>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 1; i <= 5; i++)
          GestureDetector(
            onTap: onChanged == null ? null : () => onChanged!(i),
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: EdgeInsets.only(right: i == 5 ? 0 : 1),
              child: Icon(
                value >= i
                    ? Icons.star_rounded
                    : value >= i - 0.5
                        ? Icons.star_half_rounded
                        : Icons.star_outline_rounded,
                size: size,
                color: const Color(0xFFF58634),
              ),
            ),
          ),
        if (showNumber) ...[
          const SizedBox(width: 6),
          Text(
            count > 0
                ? '${value.toStringAsFixed(1).replaceAll('.', ',')} ($count)'
                : 'Novo',
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w700,
              fontSize: 12,
              height: 1.1,
              color: Color(0xFF282829),
            ),
          ),
        ],
      ],
    );
  }
}

class _ReviewsTab extends StatelessWidget {
  const _ReviewsTab({
    required this.reviews,
    required this.canReview,
    required this.showLoginHint,
    required this.rating,
    required this.commentCtrl,
    required this.submitting,
    required this.alreadyReviewed,
    required this.onRating,
    required this.onSubmit,
  });

  final List<dynamic> reviews;
  final bool canReview;
  final bool showLoginHint;
  final int rating;
  final TextEditingController commentCtrl;
  final bool submitting;
  final bool alreadyReviewed;
  final ValueChanged<int> onRating;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (canReview) ...[
          Container(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFC5D4CF)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  alreadyReviewed
                      ? 'Atualize sua avaliação'
                      : 'Avalie este local',
                  style: const TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: Color(0xFF282829),
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Dê uma nota e conte como foi a experiência',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontSize: 13,
                    color: Color(0xFF8B8B96),
                  ),
                ),
                const SizedBox(height: 12),
                _AvgStars(
                  value: rating.toDouble(),
                  size: 32,
                  onChanged: submitting ? null : onRating,
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: commentCtrl,
                  enabled: !submitting,
                  maxLines: 4,
                  maxLength: 800,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    hintText: 'Escreva seu depoimento',
                    counterText: '',
                    filled: true,
                    fillColor: const Color(0xFFF6F8F7),
                    contentPadding: const EdgeInsets.all(14),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFFC5D4CF)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFFC5D4CF)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFFF58634)),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  height: 46,
                  child: FilledButton(
                    onPressed: submitting ? null : onSubmit,
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFFF58634),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: submitting
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            alreadyReviewed
                                ? 'Atualizar avaliação'
                                : 'Publicar avaliação',
                            style: const TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ] else if (showLoginHint)
          const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: Text(
              'Entre com uma conta de cliente para avaliar este local.',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 13,
                color: Color(0xFF8B8B96),
              ),
            ),
          ),
        const Text(
          'O que os clientes dizem',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w800,
            fontSize: 18,
            color: Color(0xFF282829),
          ),
        ),
        const SizedBox(height: 12),
        if (reviews.isEmpty)
          const Text(
            'Ainda não há avaliações. Seja o primeiro a opinar.',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              color: Color(0xFF8B8B96),
            ),
          )
        else
          for (var i = 0; i < reviews.length; i++) ...[
            _ReviewCard(review: Map<String, dynamic>.from(reviews[i] as Map)),
            if (i != reviews.length - 1) const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.review});

  final Map<String, dynamic> review;

  @override
  Widget build(BuildContext context) {
    final user = review['user'] is Map
        ? Map<String, dynamic>.from(review['user'] as Map)
        : <String, dynamic>{};
    final name = user['name']?.toString() ?? 'Cliente';
    final avatar = ApiConfig.resolveMediaUrl(user['avatarUrl']?.toString());
    final rating = (review['rating'] as num?)?.toDouble() ?? 0;
    final testimonial = review['testimonial']?.toString().trim() ?? '';
    final createdAt = DateTime.tryParse(review['createdAt']?.toString() ?? '');
    final dateLabel = createdAt == null
        ? ''
        : '${createdAt.day.toString().padLeft(2, '0')}/${createdAt.month.toString().padLeft(2, '0')}/${createdAt.year}';
    final initial =
        name.isNotEmpty ? name.substring(0, 1).toUpperCase() : 'C';

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      decoration: BoxDecoration(
        color: const Color(0xFFF6F8F7),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE8F0ED)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: const Color(0xFFE8F0ED),
                backgroundImage: avatar.isEmpty ? null : NetworkImage(avatar),
                child: avatar.isEmpty
                    ? Text(
                        initial,
                        style: const TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFFF58634),
                        ),
                      )
                    : null,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                        color: Color(0xFF282829),
                      ),
                    ),
                    if (dateLabel.isNotEmpty)
                      Text(
                        dateLabel,
                        style: const TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          fontSize: 11,
                          color: Color(0xFF8B8B96),
                        ),
                      ),
                  ],
                ),
              ),
              _AvgStars(value: rating, size: 16),
            ],
          ),
          if (testimonial.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              testimonial,
              style: const TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 13,
                height: 1.4,
                color: Color(0xFF6B6B75),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ContactTab extends StatelessWidget {
  const _ContactTab({required this.contacts});

  final dynamic contacts;

  @override
  Widget build(BuildContext context) {
    if (contacts is! Map) {
      return const _ContactEmpty();
    }
    final map = Map<String, dynamic>.from(contacts as Map);
    final phone = map['phone']?.toString().trim() ?? '';
    final whatsapp = map['whatsapp']?.toString().trim() ?? '';
    final instagram = map['instagram']?.toString().trim() ?? '';
    final items = <Widget>[
      if (phone.isNotEmpty)
        _ContactActionCard(
          title: 'Reservas',
          subtitle: 'Fale direto com nossa equipe',
          badge: _formatPhoneDisplay(phone),
          leading: const Icon(Icons.phone_rounded, color: Colors.white, size: 22),
          iconBackground: const Color(0xFFF58634),
          accent: const Color(0xFFF58634),
          onTap: () => openExternalUrl(_telUrl(phone)),
        ),
      if (whatsapp.isNotEmpty)
        _ContactActionCard(
          title: 'WhatsApp',
          subtitle: 'Respostas rápidas',
          badge: _formatPhoneDisplay(whatsapp),
          leading: const FaIcon(FontAwesomeIcons.whatsapp, color: Colors.white, size: 20),
          iconBackground: const Color(0xFF25D366),
          accent: const Color(0xFF25D366),
          onTap: () => openExternalUrl(_whatsappUrl(whatsapp)),
        ),
      if (instagram.isNotEmpty)
        _ContactActionCard(
          title: 'Instagram',
          subtitle: 'Acompanhe novidades',
          badge: _instagramHandle(instagram),
          leading: const FaIcon(FontAwesomeIcons.instagram, color: Colors.white, size: 20),
          iconGradient: const LinearGradient(
            begin: Alignment.bottomLeft,
            end: Alignment.topRight,
            colors: [
              Color(0xFFF58529),
              Color(0xFFDD2A7B),
              Color(0xFF8134AF),
            ],
          ),
          accent: const Color(0xFFE1306C),
          onTap: () => openExternalUrl(_instagramUrl(instagram)),
        ),
    ];
    if (items.isEmpty) {
      return const _ContactEmpty();
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Fale com a gente',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w800,
            fontSize: 18,
            color: Color(0xFF282829),
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Escolha o melhor jeito para entrar em contato',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontSize: 13,
            color: Color(0xFF8B8B96),
          ),
        ),
        const SizedBox(height: 16),
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          items[i],
        ],
      ],
    );
  }
}

class _ContactEmpty extends StatelessWidget {
  const _ContactEmpty();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Text(
        'Contato ainda não informado.',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontFamily: AppTheme.fontFamily,
          color: Color(0xFF8B8B96),
        ),
      ),
    );
  }
}

class _ContactActionCard extends StatelessWidget {
  const _ContactActionCard({
    required this.title,
    required this.subtitle,
    required this.badge,
    required this.leading,
    required this.accent,
    required this.onTap,
    this.iconBackground,
    this.iconGradient,
  });

  final String title;
  final String subtitle;
  final String badge;
  final Widget leading;
  final Color? iconBackground;
  final Gradient? iconGradient;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.06),
                blurRadius: 16,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: iconGradient == null ? iconBackground : null,
                    gradient: iconGradient,
                  ),
                  alignment: Alignment.center,
                  child: leading,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                          color: Color(0xFF282829),
                        ),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        subtitle,
                        style: const TextStyle(
                          fontFamily: AppTheme.fontFamily,
                          fontSize: 11,
                          color: Color(0xFF8B8B96),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: accent,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          badge,
                          style: const TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontWeight: FontWeight.w700,
                            fontSize: 11,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: accent, size: 26),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

String _digitsOnly(String value) => value.replaceAll(RegExp(r'\D'), '');

String _nationalPhoneDigits(String raw) {
  var digits = _digitsOnly(raw);
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.substring(2);
  }
  return digits;
}

String _e164Digits(String raw) {
  var digits = _digitsOnly(raw);
  if (!digits.startsWith('55') &&
      (digits.length == 10 || digits.length == 11)) {
    digits = '55$digits';
  }
  return digits;
}

String _telUrl(String raw) => 'tel:+${_e164Digits(raw)}';

String _whatsappUrl(String raw) => 'https://wa.me/${_e164Digits(raw)}';

String _instagramHandle(String raw) {
  var handle = raw.trim();
  if (handle.contains('instagram.com/')) {
    handle = handle.split('instagram.com/').last.split(RegExp(r'[/?#]')).first;
  }
  handle = handle.replaceAll('@', '').replaceAll(RegExp(r'[^A-Za-z0-9._]'), '');
  if (handle.isEmpty) return raw.trim();
  return '@$handle';
}

String _instagramUrl(String raw) {
  final handle = _instagramHandle(raw).replaceFirst('@', '');
  return 'https://instagram.com/$handle';
}

String _formatPhoneDisplay(String raw) {
  final digits = _nationalPhoneDigits(raw);
  if (digits.length == 11) {
    return '${digits.substring(0, 2)} ${digits.substring(2, 7)}-${digits.substring(7)}';
  }
  if (digits.length == 10) {
    return '${digits.substring(0, 2)} ${digits.substring(2, 6)}-${digits.substring(6)}';
  }
  return raw.trim();
}

List<Widget> _hoursRows(dynamic hoursJson) {
  const days = [
    ('mon', 'Segunda'),
    ('tue', 'Terça'),
    ('wed', 'Quarta'),
    ('thu', 'Quinta'),
    ('fri', 'Sexta'),
    ('sat', 'Sábado'),
    ('sun', 'Domingo'),
  ];
  if (hoursJson is! Map) {
    return const [
      Text(
        'Horário não informado.',
        style: TextStyle(fontFamily: AppTheme.fontFamily, color: Color(0xFF8B8B96)),
      ),
    ];
  }
  final map = Map<String, dynamic>.from(hoursJson);
  return days.map((day) {
    final value = map[day.$1];
    var hours = 'Fechado';
    if (value is Map) {
      if (value['closed'] == true) {
        hours = 'Fechado';
      } else {
        final open = value['open']?.toString();
        final close = value['close']?.toString();
        if (open != null && close != null) {
          hours = '$open – $close';
        }
      }
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              day.$2,
              style: const TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 13,
                color: Color(0xFF6B6B75),
              ),
            ),
          ),
          Text(
            hours,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 13,
              color: Color(0xFF6B6B75),
            ),
          ),
        ],
      ),
    );
  }).toList();
}

double _haversineKm(double lat1, double lng1, double lat2, double lng2) {
  const earth = 6371.0;
  final dLat = _toRad(lat2 - lat1);
  final dLng = _toRad(lng2 - lng1);
  final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(_toRad(lat1)) * math.cos(_toRad(lat2)) * math.sin(dLng / 2) * math.sin(dLng / 2);
  return earth * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
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
