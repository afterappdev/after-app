import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../../core/config/api_config.dart';
import '../../core/constants/venue_music_styles.dart';
import '../../core/location/open_url.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/after_bottom_nav.dart';
import 'venue_hours.dart';
import 'venue_public_amenities.dart';

const _claimPurple = Color(0xFF6B4EFF);

class VenueStandardPublicView extends StatelessWidget {
  const VenueStandardPublicView({
    super.key,
    required this.venue,
    required this.venueId,
    required this.navIndex,
    required this.onBack,
    required this.onNavTap,
    required this.onOpenMap,
    this.onSafetyMenu,
  });

  final Map<String, dynamic> venue;
  final String venueId;
  final int navIndex;
  final VoidCallback onBack;
  final ValueChanged<int> onNavTap;
  final VoidCallback onOpenMap;
  final VoidCallback? onSafetyMenu;

  @override
  Widget build(BuildContext context) {
    final logo = ApiConfig.resolveMediaUrl(venue['logoUrl']?.toString());
    final name = venue['name']?.toString() ?? 'Local';
    final category = venueCategoryWithStyle(
      venue['category']?.toString(),
      venue['musicStyle']?.toString(),
    );
    final city = venue['city']?.toString() ?? '';
    final state = venue['state']?.toString() ?? '';
    final contacts = venue['contacts'];
    final contactMap = contacts is Map
        ? Map<String, dynamic>.from(contacts)
        : <String, dynamic>{};
    final instagram = contactMap['instagram']?.toString().trim() ?? '';
    final street = contactMap['address']?.toString().trim() ?? '';
    final cityLine = [
      if (city.isNotEmpty) city,
      if (state.isNotEmpty) state,
    ].join(', ');
    final claimUrl = venue['claimProfileUrl']?.toString();

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
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
                    child: Row(
                      children: [
                        IconButton(
                          onPressed: onBack,
                          icon: const Icon(Icons.arrow_back),
                        ),
                        const Spacer(),
                        if (onSafetyMenu != null)
                          IconButton(
                            key: const Key('venue-safety-menu'),
                            onPressed: onSafetyMenu,
                            tooltip: 'Mais opções',
                            icon: const Icon(Icons.more_vert),
                          ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(16),
                              child: logo.isNotEmpty
                                  ? Image.network(
                                      logo,
                                      width: 72,
                                      height: 72,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, _) =>
                                          const _LogoPlaceholder(),
                                    )
                                  : const _LogoPlaceholder(),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    name,
                                    style: const TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 22,
                                      height: 1.15,
                                      color: Color(0xFF282829),
                                    ),
                                  ),
                                  if (category.isNotEmpty) ...[
                                    const SizedBox(height: 4),
                                    Text(
                                      category,
                                      style: const TextStyle(
                                        fontFamily: AppTheme.fontFamily,
                                        fontSize: 13,
                                        color: Color(0xFF8B8B96),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (instagram.isNotEmpty) ...[
                          const SizedBox(height: 22),
                          _InstagramRow(
                            handle: _instagramLabel(instagram),
                            onTap: () => openExternalUrl(_instagramUrl(instagram)),
                          ),
                          const Padding(
                            padding: EdgeInsets.only(top: 18),
                            child: Divider(
                              height: 1,
                              thickness: 1,
                              color: Color(0xFFF0F0F3),
                            ),
                          ),
                        ],
                        const SizedBox(height: 20),
                        const _SectionTitle('Comodidades'),
                        const SizedBox(height: 12),
                        VenueOwnedAmenities(contacts: contactMap),
                        const SizedBox(height: 24),
                        const _SectionTitle('Endereço'),
                        const SizedBox(height: 10),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            const Icon(
                              Icons.location_on,
                              color: Color(0xFFF58634),
                              size: 22,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (street.isNotEmpty)
                                    Text(
                                      street,
                                      style: const TextStyle(
                                        fontFamily: AppTheme.fontFamily,
                                        fontSize: 13,
                                        height: 1.35,
                                        color: Color(0xFF6B6B75),
                                      ),
                                    ),
                                  Text(
                                    cityLine.isEmpty
                                        ? 'Endereço não informado'
                                        : cityLine,
                                    style: const TextStyle(
                                      fontFamily: AppTheme.fontFamily,
                                      fontSize: 13,
                                      height: 1.35,
                                      color: Color(0xFF6B6B75),
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
                                side: const BorderSide(color: Color(0xFFE4E4EA)),
                                backgroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 8,
                                ),
                                minimumSize: Size.zero,
                                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                visualDensity: VisualDensity.compact,
                                shape: const StadiumBorder(),
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
                        const SizedBox(height: 24),
                        const Row(
                          children: [
                            Icon(Icons.schedule, color: Color(0xFFF58634), size: 22),
                            SizedBox(width: 8),
                            Text(
                              'Horário de funcionamento',
                              style: TextStyle(
                                fontFamily: AppTheme.fontFamily,
                                fontWeight: FontWeight.w800,
                                fontSize: 16,
                                color: Color(0xFF282829),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        ..._hoursRows(venue['hoursJson']),
                        const SizedBox(height: 28),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: () => _openClaim(context, claimUrl),
                            style: FilledButton.styleFrom(
                              backgroundColor: _claimPurple,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 20,
                                vertical: 14,
                              ),
                              shape: const StadiumBorder(),
                              textStyle: const TextStyle(
                                fontFamily: AppTheme.fontFamily,
                                fontWeight: FontWeight.w700,
                                fontSize: 15,
                                height: 1.25,
                              ),
                            ),
                            child: const Text(
                              'Criar perfil completo do local\n(sou o responsável)',
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  AfterBottomNav(index: navIndex, onTap: onNavTap),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _openClaim(BuildContext context, String? claimUrl) {
    if (kIsWeb) {
      Navigator.of(context).pushNamed(
        AppRoutes.claimProfile,
        arguments: venueId,
      );
      return;
    }
    final target = claimUrl ??
        'https://app-after.com.br/app/#/reivindicar?venueId=${Uri.encodeComponent(venueId)}';
    openExternalUrl(target);
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontFamily: AppTheme.fontFamily,
        fontWeight: FontWeight.w800,
        fontSize: 16,
        color: Color(0xFF282829),
      ),
    );
  }
}

class _InstagramRow extends StatelessWidget {
  const _InstagramRow({required this.handle, required this.onTap});

  final String handle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: SizedBox(
            width: double.infinity,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Align(
                    alignment: Alignment.center,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              begin: Alignment.bottomLeft,
                              end: Alignment.topRight,
                              colors: [
                                Color(0xFFF58529),
                                Color(0xFFDD2A7B),
                                Color(0xFF8134AF),
                              ],
                            ),
                          ),
                          alignment: Alignment.center,
                          child: const FaIcon(
                            FontAwesomeIcons.instagram,
                            color: Colors.white,
                            size: 20,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Text(
                              'Instagram',
                              style: TextStyle(
                                fontFamily: AppTheme.fontFamily,
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                                color: Color(0xFF282829),
                              ),
                            ),
                            const SizedBox(height: 6),
                            DecoratedBox(
                              decoration: BoxDecoration(
                                color: const Color(0xFFE1306C),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 4,
                                ),
                                child: Text(
                                  handle,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontFamily: AppTheme.fontFamily,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 12,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const Positioned(
                  right: 0,
                  top: 0,
                  bottom: 0,
                  child: Icon(
                    Icons.chevron_right_rounded,
                    color: Color(0xFFE1306C),
                    size: 26,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LogoPlaceholder extends StatelessWidget {
  const _LogoPlaceholder();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 72,
      height: 72,
      color: const Color(0xFFF0F0F3),
      alignment: Alignment.center,
      child: const Icon(Icons.storefront, color: Color(0xFF8B8B96)),
    );
  }
}

String _instagramLabel(String raw) {
  final handle = raw.trim();
  if (handle.startsWith('@')) return handle;
  if (handle.contains('instagram.com')) {
    final parts = Uri.tryParse(handle.startsWith('http') ? handle : 'https://$handle')
        ?.pathSegments;
    if (parts != null && parts.isNotEmpty) return '@${parts.last}';
  }
  return handle.startsWith('@') ? handle : '@$handle';
}

String _instagramUrl(String raw) {
  final trimmed = raw.trim();
  if (trimmed.startsWith('http')) return trimmed;
  final handle = trimmed.replaceFirst('@', '');
  return 'https://instagram.com/$handle';
}

List<Widget> _hoursRows(dynamic hoursJson) {
  if (hoursJson is! Map) {
    return const [
      Text(
        'Horário não informado.',
        style: TextStyle(fontFamily: AppTheme.fontFamily, color: Color(0xFF8B8B96)),
      ),
    ];
  }
  final map = Map<String, dynamic>.from(hoursJson);
  return venueHoursDays.map((day) {
    final value = map[day.key];
    final hours = formatVenueDayHoursText(value);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              day.label,
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