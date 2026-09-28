import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Keeps the filter sheet above the system navigation bar, the home indicator
/// and the keyboard, and bounds the scrollable area so the actions stay reachable.
class VenueFilterSheetLayout extends StatelessWidget {
  const VenueFilterSheetLayout({super.key, required this.child});

  final Widget child;

  static double bottomObstacle(MediaQueryData media) {
    return media.viewInsets.bottom + media.padding.bottom;
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final obstacle = bottomObstacle(media);
    final maxHeight = math.max(
      0.0,
      media.size.height - media.padding.top - obstacle,
    );
    return Padding(
      padding: EdgeInsets.only(bottom: obstacle),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: child,
      ),
    );
  }
}
