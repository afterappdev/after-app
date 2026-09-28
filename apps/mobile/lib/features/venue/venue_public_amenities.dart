import 'package:flutter/material.dart';

import '../../core/constants/venue_amenities.dart';
import '../../core/theme/app_theme.dart';

class VenueOwnedAmenities extends StatelessWidget {
  const VenueOwnedAmenities({super.key, required this.contacts});

  final Map<String, dynamic> contacts;

  @override
  Widget build(BuildContext context) {
    final items = VenueAmenities.owned(contacts);
    if (items.isEmpty) {
      return const Text(
        'Nenhuma comodidade informada.',
        style: TextStyle(
          fontFamily: AppTheme.fontFamily,
          fontSize: 13,
          color: Color(0xFF8B8B96),
        ),
      );
    }
    return Column(
      children: [
        for (var i = 0; i < items.length; i += 2)
          Padding(
            padding: EdgeInsets.only(bottom: i + 2 < items.length ? 8 : 0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: _OwnedAmenity(item: items[i])),
                const SizedBox(width: 8),
                Expanded(
                  child: i + 1 < items.length
                      ? _OwnedAmenity(item: items[i + 1])
                      : const SizedBox(),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class VenueEntryLine extends StatelessWidget {
  const VenueEntryLine({super.key, required this.contacts});

  final Map<String, dynamic> contacts;

  @override
  Widget build(BuildContext context) {
    final hasCoverCharge = contacts['hasCoverCharge'] == true;
    final coverCharge = contacts['coverCharge']?.toString() ?? '';
    final label = formatVenueEntry(
      hasCoverCharge: hasCoverCharge,
      coverCharge: coverCharge,
    );
    return Row(
      children: [
        const Icon(Icons.payments_outlined, size: 20, color: Color(0xFFF58634)),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 13,
              height: 1.3,
              fontWeight: FontWeight.w700,
              color: Color(0xFF282829),
            ),
          ),
        ),
      ],
    );
  }
}

class _OwnedAmenity extends StatelessWidget {
  const _OwnedAmenity({required this.item});

  final VenueAmenity item;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
      child: Row(
        children: [
          Icon(item.icon, size: 20, color: const Color(0xFFF58634)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              item.label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontSize: 12,
                height: 1.2,
                fontWeight: FontWeight.w700,
                color: Color(0xFF282829),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
