import 'package:flutter/material.dart';

import '../../core/constants/venue_categories.dart';
import '../../core/location/geo_origin.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import 'venue_pin.dart';

const kVenueProfileVisibilityHintText =
    'Para o seu estabelecimento aparecer na lista do After, é obrigatório '
    'preencher: Logo, Capa, Localização, Categoria e Descrição.';

bool venueListingProfileIncomplete(Map<String, dynamic> venue) {
  return venueListingProfileMissingFields(venue).isNotEmpty;
}

List<String> venueListingProfileMissingFields(Map<String, dynamic> venue) {
  final missing = <String>[];
  final logo = venue['logoUrl']?.toString().trim() ?? '';
  if (logo.isEmpty) missing.add('Logo');
  final cover = venue['coverUrl']?.toString().trim() ?? '';
  if (cover.isEmpty) missing.add('Capa');
  if (!_venueHasListingLocation(venue)) missing.add('Localização');
  if (!venueHasListingCategory(venue['category']?.toString())) {
    missing.add('Categoria');
  }
  final description = venue['description']?.toString().trim() ?? '';
  if (description.isEmpty) missing.add('Descrição');
  return missing;
}

bool venueHasListingCategory(String? category) {
  final raw = category?.trim() ?? '';
  if (raw.isEmpty) return false;
  if (VenueCategories.resolve(raw) == VenueCategories.legacyLiveMusic) {
    return false;
  }
  return true;
}

bool _venueHasListingLocation(Map<String, dynamic> venue) {
  final lat = (venue['lat'] as num?)?.toDouble();
  final lng = (venue['lng'] as num?)?.toDouble();
  if (lat == null || lng == null) return false;
  return GeoOrigin.tryCreate(lat: lat, lng: lng) != null;
}

bool venueListingProfileIncompleteFromPin({
  required String? logoUrl,
  required String? coverUrl,
  required String description,
  required String? category,
  required bool requiresCategoryChoice,
  required VenuePin pin,
}) {
  if (requiresCategoryChoice) return true;
  return venueListingProfileIncomplete({
    'logoUrl': logoUrl,
    'coverUrl': coverUrl,
    'description': description,
    'category': category,
    'lat': pin.lat,
    'lng': pin.lng,
  });
}

Future<void> showVenueListingProfileDialogIfNeeded(
  BuildContext context, {
  required Map<String, dynamic> venue,
}) async {
  if (!venueListingProfileIncomplete(venue)) return;
  await showVenueListingProfileDialog(context);
}

Future<void> showVenueListingProfileDialog(BuildContext context) {
  return showDialog<void>(
    context: context,
    barrierDismissible: true,
    builder: (ctx) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: const Text(
        'Complete o cadastro do local',
        style: TextStyle(
          fontFamily: AppTheme.fontFamily,
          fontWeight: FontWeight.w800,
          fontSize: 17,
          color: Color(0xFF282829),
        ),
      ),
      content: const Text(
        kVenueProfileVisibilityHintText,
        style: TextStyle(
          fontFamily: AppTheme.fontFamily,
          fontSize: 13,
          height: 1.45,
          color: Color(0xFF3D3D42),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Entendi'),
        ),
        TextButton(
          onPressed: () {
            Navigator.pop(ctx);
            Navigator.of(context).pushNamed(AppRoutes.venueEdit);
          },
          child: const Text('Editar agora'),
        ),
      ],
    ),
  );
}

class VenueProfileVisibilityHintCard extends StatelessWidget {
  const VenueProfileVisibilityHintCard({super.key, this.onEdit});

  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF6EE),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFF58634).withValues(alpha: 0.45)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline, size: 20, color: Color(0xFFF58634)),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  kVenueProfileVisibilityHintText,
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontSize: 12,
                    height: 1.4,
                    color: Color(0xFF3D3D42),
                  ),
                ),
              ),
            ],
          ),
          if (onEdit != null) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: onEdit,
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFFF58634),
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text(
                  'Preencher agora',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}