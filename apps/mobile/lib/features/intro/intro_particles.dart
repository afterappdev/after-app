import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'intro_style.dart';

class IntroParticles extends StatelessWidget {
  const IntroParticles({
    super.key,
    required this.progress,
    required this.opacity,
    this.burst = 0,
  });

  final double progress;
  final double opacity;
  final double burst;

  static const _dots = <_Dot>[
    _Dot(0.18, 0.28, 2.2, 0.4, 1.1),
    _Dot(0.78, 0.24, 1.8, 1.2, 0.9),
    _Dot(0.22, 0.62, 2.6, 2.0, 1.3),
    _Dot(0.84, 0.58, 1.6, 0.7, 1.0),
    _Dot(0.12, 0.46, 1.4, 1.8, 0.8),
    _Dot(0.70, 0.72, 2.0, 2.4, 1.2),
    _Dot(0.52, 0.18, 1.5, 0.2, 0.7),
  ];

  @override
  Widget build(BuildContext context) {
    if (opacity <= 0) return const SizedBox.shrink();
    return IgnorePointer(
      child: CustomPaint(
        painter: _ParticlesPainter(
          progress: progress,
          opacity: opacity,
          burst: burst,
        ),
        child: const SizedBox.expand(),
      ),
    );
  }
}

class _Dot {
  const _Dot(this.x, this.y, this.radius, this.phase, this.speed);
  final double x;
  final double y;
  final double radius;
  final double phase;
  final double speed;
}

class _ParticlesPainter extends CustomPainter {
  _ParticlesPainter({
    required this.progress,
    required this.opacity,
    required this.burst,
  });

  final double progress;
  final double opacity;
  final double burst;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..style = PaintingStyle.fill;
    for (final dot in IntroParticles._dots) {
      final wave = math.sin((progress * math.pi * 2 * dot.speed) + dot.phase);
      final spread = 1 + burst * 0.45;
      final dx = math.cos(dot.phase) * 6 * wave;
      final dy = 8 * wave;
      paint.color = IntroStyle.purpleSoft.withValues(
        alpha: (0.08 + 0.10 * burst + 0.06 * ((wave + 1) / 2)) * opacity,
      );
      canvas.drawCircle(
        Offset(
          (0.5 + (dot.x - 0.5) * spread) * size.width + dx,
          (0.5 + (dot.y - 0.5) * spread) * size.height + dy,
        ),
        dot.radius + burst,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ParticlesPainter oldDelegate) =>
      oldDelegate.progress != progress ||
      oldDelegate.opacity != opacity ||
      oldDelegate.burst != burst;
}
