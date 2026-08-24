import 'package:flutter/material.dart';

import 'intro_style.dart';

class IntroStageDots extends StatelessWidget {
  const IntroStageDots({super.key, required this.stage});

  /// 0 = logo, 1 = tagline
  final int stage;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < 2; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          AnimatedContainer(
            duration: const Duration(milliseconds: 280),
            curve: Curves.easeOutCubic,
            width: stage == i ? 22 : 12,
            height: 4,
            decoration: BoxDecoration(
              color: stage == i
                  ? IntroStyle.purple
                  : const Color(0xFFD5DEDB),
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ],
      ],
    );
  }
}
