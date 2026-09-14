import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/theme/app_theme.dart';

const brazilFallback = LatLng(-14.235, -51.9253);

class VenueLocationMap extends StatelessWidget {
  const VenueLocationMap({
    super.key,
    required this.controller,
    required this.point,
    required this.onSelect,
    this.onMapReady,
  });

  final MapController controller;
  final LatLng? point;
  final ValueChanged<LatLng> onSelect;
  final VoidCallback? onMapReady;

  @override
  Widget build(BuildContext context) {
    final center = point ?? brazilFallback;
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        height: 196,
        child: FlutterMap(
          mapController: controller,
          options: MapOptions(
            initialCenter: center,
            initialZoom: point == null ? 4 : 16,
            minZoom: 3,
            maxZoom: 19,
            interactionOptions: const InteractionOptions(
              flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
            ),
            onTap: (_, latLng) => onSelect(latLng),
            onMapReady: onMapReady,
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.r2p.after.after_app',
              maxNativeZoom: 19,
            ),
            if (point != null)
              MarkerLayer(
                markers: [
                  Marker(
                    point: point!,
                    width: 40,
                    height: 40,
                    alignment: Alignment.bottomCenter,
                    child: const Icon(
                      Icons.location_on,
                      color: AppTheme.brand,
                      size: 40,
                    ),
                  ),
                ],
              ),
            const Align(
              alignment: Alignment.bottomRight,
              child: ColoredBox(
                color: Color(0xE6FFFFFF),
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                  child: Text(
                    '© OpenStreetMap contributors',
                    style: TextStyle(
                      fontFamily: AppTheme.fontFamily,
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                      color: Color(0xFF5C5C5C),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
