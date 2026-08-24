import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/after_logo.dart';
import 'intro_particles.dart';
import 'intro_stage_dots.dart';
import 'intro_style.dart';

class AfterIntroScreen extends StatefulWidget {
  const AfterIntroScreen({super.key, required this.onFinished});

  final VoidCallback onFinished;

  @override
  State<AfterIntroScreen> createState() => _AfterIntroScreenState();
}

class _AfterIntroScreenState extends State<AfterIntroScreen>
    with SingleTickerProviderStateMixin {
  static const _logoTagGap = 12.0;
  static const _tagHeight = 15.0;
  static const _logoH = 72.0;
  late final AnimationController _controller;
  late final Animation<double> _logoOpacity;
  late final Animation<double> _logoScale;
  late final Animation<double> _tagOpacity;
  late final Animation<double> _tagSlide;
  late final Animation<double> _particles;
  late final Animation<double> _burst;
  late final Animation<double> _fadeOut;

  bool _started = false;
  bool _finished = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: IntroStyle.duration);

    _logoOpacity = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.00, 0.30, curve: Curves.easeOutCubic),
    );
    _logoScale = Tween<double>(begin: 0.85, end: 1).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.00, 0.30, curve: Curves.easeOutCubic),
      ),
    );

    _tagOpacity = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.30, 0.55, curve: Curves.easeOutCubic),
    );
    _tagSlide = Tween<double>(begin: 18, end: 0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.30, 0.55, curve: Curves.easeOutCubic),
      ),
    );
    _burst = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.30, 0.48, curve: Curves.easeOutCubic),
      ),
    );
    _particles = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.25, 0.88, curve: Curves.easeInOut),
      ),
    );

    _fadeOut = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.85, 1.00, curve: Curves.easeInOut),
    );
    _controller.addStatusListener(_onStatus);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.duration = const Duration(milliseconds: 420);
    }
    _controller.forward();
  }

  void _onStatus(AnimationStatus status) {
    if (status != AnimationStatus.completed || _finished || !mounted) return;
    _finished = true;
    widget.onFinished();
  }

  @override
  void dispose() {
    _controller.removeStatusListener(_onStatus);
    _controller.dispose();
    super.dispose();
  }

  int _stageFor(double value) {
    if (value < 0.30) return 0;
    return 1;
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.disableAnimationsOf(context);

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final fade = _fadeOut.value;
        final bg = Color.lerp(IntroStyle.bg, IntroStyle.destinationBg, fade)!;
        final contentOpacity = (1 - fade).clamp(0.0, 1.0);
        final particleOpacity = reduceMotion
            ? 0.0
            : _particles.value * (1 - fade) * 0.9;

        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: Brightness.dark,
            statusBarBrightness: Brightness.light,
            systemNavigationBarColor: bg,
            systemNavigationBarIconBrightness: Brightness.dark,
          ),
          child: Scaffold(
            backgroundColor: bg,
            body: SafeArea(
              child: Opacity(
                opacity: contentOpacity,
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 430),
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final h = constraints.maxHeight;
                        const columnH = _logoH + _logoTagGap + _tagHeight;
                        final columnTop = (h - columnH) / 2;

                        return Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Positioned.fill(
                              child: IntroParticles(
                                progress: _controller.value,
                                opacity: particleOpacity,
                                burst: reduceMotion ? 0 : _burst.value,
                              ),
                            ),
                            Positioned(
                              left: 0,
                              right: 0,
                              top: columnTop,
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  SizedBox(
                                    width: 180,
                                    height: _logoH,
                                    child: Stack(
                                      clipBehavior: Clip.none,
                                      alignment: Alignment.center,
                                      children: [
                                        Positioned(
                                          left: -40,
                                          right: -40,
                                          top: -36,
                                          bottom: -36,
                                          child: DecoratedBox(
                                            decoration: BoxDecoration(
                                              shape: BoxShape.circle,
                                              gradient: RadialGradient(
                                                colors: [
                                                  IntroStyle.purple.withValues(
                                                    alpha: 0.14 *
                                                        _logoOpacity.value,
                                                  ),
                                                  IntroStyle.purple.withValues(
                                                    alpha: 0,
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ),
                                        ),
                                        Opacity(
                                          opacity: _logoOpacity.value,
                                          child: Transform.scale(
                                            scale: _logoScale.value,
                                            child: const AfterLogo(height: _logoH),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: _logoTagGap),
                                  Transform.translate(
                                    offset: Offset(0, _tagSlide.value),
                                    child: Opacity(
                                      opacity: _tagOpacity.value,
                                      child: const Text(
                                        'O que temos pra hoje?',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(
                                          fontFamily: AppTheme.fontFamily,
                                          fontSize: 14,
                                          height: 1.1,
                                          fontWeight: FontWeight.w500,
                                          color: Color(0xFF282829),
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Positioned(
                              left: 0,
                              right: 0,
                              bottom: 22,
                              child: IntroStageDots(
                                stage: _stageFor(_controller.value),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
