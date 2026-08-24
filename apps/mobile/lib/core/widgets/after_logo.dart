import 'package:flutter/material.dart';

/// Logo After (`assets/images/logo_after.png`).
class AfterLogo extends StatelessWidget {
  const AfterLogo({
    super.key,
    this.height = 48,
    this.alignment = Alignment.center,
  });

  final double height;
  final Alignment alignment;

  static const assetPath = 'assets/images/logo_after.png';

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: alignment,
      child: Image.asset(
        assetPath,
        height: height,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.high,
        semanticLabel: 'After',
      ),
    );
  }
}
