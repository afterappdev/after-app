import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../../core/router/app_router.dart';
import 'public_chrome.dart';

/// Native width of every desktop landing art slice.
const double kLandingArtMaxWidth = 1024;

/// Web phones use the dedicated mobile arts below this width.
const double kLandingMobileBreakpoint = 600;

const Color _kLandingBg = Color(0xFF05050C);

/// Sticky header glass: dark translucent tint over a light backdrop blur.
const double _kHeaderBlurSigma = 16;
const double _kHeaderArtOpacity = 0.94;
const Color _kHeaderGlassTint = Color(0x66000000);

class LandingArt {
  static const header = 'assets/images/landing_final/landing_header.jpg';
  static const hero = 'assets/images/landing_final/landing_hero.jpg';
  static const features = 'assets/images/landing_final/landing_features.jpg';
  static const business = 'assets/images/landing_final/landing_business.jpg';
  static const footer = 'assets/images/landing_final/landing_footer.jpg';

  static const assets = [header, hero, features, business, footer];

  static const headerAspect = 1024 / 91;
  static const heroAspect = 1024 / 591;
  static const featuresAspect = 1024 / 897;
  static const businessAspect = 1024 / 353;
  static const footerAspect = 1024 / 218;
}

class MobileLandingArt {
  static const header = 'assets/images/landing_mobile/mobile_header.jpg';
  static const hero = 'assets/images/landing_mobile/mobile_hero.jpg';
  static const intro = 'assets/images/landing_mobile/mobile_intro.jpg';
  static const features = 'assets/images/landing_mobile/mobile_features.jpg';
  static const business = 'assets/images/landing_mobile/mobile_business.jpg';
  static const footer = 'assets/images/landing_mobile/mobile_footer.jpg';

  static const assets = [header, hero, intro, features, business, footer];

  static const headerAspect = 1024 / 360;
  static const heroAspect = 473 / 1024;
  static const introAspect = 473 / 1024;
  static const featuresAspect = 473 / 1024;
  static const businessAspect = 473 / 1024;
  static const footerAspect = 483 / 1024;
}

class LandingHotspot {
  const LandingHotspot({
    this.key,
    required this.left,
    required this.top,
    required this.width,
    required this.height,
    this.onTap,
    this.semanticLabel,
  });

  /// Fractions of the rendered image (0–1).
  final Key? key;
  final double left;
  final double top;
  final double width;
  final double height;
  final VoidCallback? onTap;
  final String? semanticLabel;
}

/// Full-width art slice with proportional invisible hit targets.
class LandingArtSlice extends StatelessWidget {
  const LandingArtSlice({
    super.key,
    required this.asset,
    required this.aspectRatio,
    this.semanticLabel,
    this.hotspots = const [],
  });

  final String asset;
  final double aspectRatio;
  final String? semanticLabel;
  final List<LandingHotspot> hotspots;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final height = width / aspectRatio;
        return SizedBox(
          width: width,
          height: height,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.asset(
                asset,
                width: width,
                height: height,
                fit: BoxFit.fitWidth,
                alignment: Alignment.topCenter,
                filterQuality: FilterQuality.high,
                gaplessPlayback: true,
                semanticLabel: semanticLabel,
              ),
              for (final spot in hotspots)
                Positioned(
                  left: width * spot.left,
                  top: height * spot.top,
                  width: width * spot.width,
                  height: height * spot.height,
                  child: Semantics(
                    button: true,
                    enabled: spot.onTap != null,
                    label: spot.semanticLabel,
                    child: MouseRegion(
                      cursor: spot.onTap == null
                          ? SystemMouseCursors.basic
                          : SystemMouseCursors.click,
                      child: GestureDetector(
                        key: spot.key,
                        behavior: HitTestBehavior.translucent,
                        onTap: spot.onTap,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class LandingPage extends StatefulWidget {
  const LandingPage({super.key});

  @override
  State<LandingPage> createState() => _LandingPageState();
}

class _LandingPageState extends State<LandingPage> {
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final mobile = MediaQuery.sizeOf(context).width < kLandingMobileBreakpoint;
    final assets = mobile ? MobileLandingArt.assets : LandingArt.assets;
    for (final asset in assets) {
      precacheImage(AssetImage(asset), context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    if (width < kLandingMobileBreakpoint) {
      return const _MobileLanding();
    }
    return const _DesktopLanding();
  }
}

class _DesktopLanding extends StatelessWidget {
  const _DesktopLanding();

  List<LandingHotspot> _headerHotspots(BuildContext context) {
    return [
      LandingHotspot(
        key: const Key('public-header-entrar'),
        left: 0.781,
        top: 0.165,
        width: 0.186,
        height: 0.66,
        semanticLabel: 'Login/ Cadastre-se',
        onTap: () => goToLogin(context),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final topInset = media.padding.top;
    final pageWidth = media.size.width;
    final artWidth =
        pageWidth > kLandingArtMaxWidth ? kLandingArtMaxWidth : pageWidth;
    final headerHeight = artWidth / LandingArt.headerAspect;
    final overlayHeight = topInset + headerHeight;

    return Scaffold(
      backgroundColor: _kLandingBg,
      body: ColoredBox(
        key: const Key('landing-desktop'),
        color: _kLandingBg,
        child: Stack(
          children: [
            Positioned.fill(
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: kLandingArtMaxWidth),
                  child: SingleChildScrollView(
                    key: const Key('landing-scroll'),
                    padding: EdgeInsets.only(top: overlayHeight),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        LandingArtSlice(
                          key: const Key('landing-art-hero'),
                          asset: LandingArt.hero,
                          aspectRatio: LandingArt.heroAspect,
                          semanticLabel: 'After — O que temos pra hoje?',
                          hotspots: const [
                            LandingHotspot(
                              key: Key('landing-badge-play'),
                              left: 0.555,
                              top: 0.652,
                              width: 0.185,
                              height: 0.150,
                              semanticLabel: 'Google Play',
                            ),
                            LandingHotspot(
                              key: Key('landing-badge-store'),
                              left: 0.738,
                              top: 0.652,
                              width: 0.195,
                              height: 0.150,
                              semanticLabel: 'App Store',
                            ),
                          ],
                        ),
                        const LandingArtSlice(
                          key: Key('landing-art-features'),
                          asset: LandingArt.features,
                          aspectRatio: LandingArt.featuresAspect,
                          semanticLabel:
                              'Encontre restaurantes, bares e promoções perto de você',
                        ),
                        const LandingArtSlice(
                          key: Key('landing-art-business'),
                          asset: LandingArt.business,
                          aspectRatio: LandingArt.businessAspect,
                          semanticLabel:
                              'Cadastre gratuitamente seu estabelecimento no After',
                        ),
                        LandingArtSlice(
                          key: const Key('landing-art-footer'),
                          asset: LandingArt.footer,
                          aspectRatio: LandingArt.footerAspect,
                          semanticLabel: 'Páginas e recursos After',
                          hotspots: [
                            LandingHotspot(
                              key: const Key('public-footer-contact'),
                              left: 0.47,
                              top: 0.40,
                              width: 0.20,
                              height: 0.15,
                              semanticLabel: 'Fale conosco (whats)',
                              onTap: () => Navigator.of(context)
                                  .pushNamed(AppRoutes.contact),
                            ),
                            LandingHotspot(
                              key: const Key('public-footer-privacy'),
                              left: 0.47,
                              top: 0.55,
                              width: 0.21,
                              height: 0.15,
                              semanticLabel: 'Política de Privacidade',
                              onTap: () => Navigator.of(context)
                                  .pushNamed(AppRoutes.privacy),
                            ),
                            LandingHotspot(
                              key: const Key('public-footer-deletion'),
                              left: 0.47,
                              top: 0.70,
                              width: 0.20,
                              height: 0.16,
                              semanticLabel: 'Exclusão de conta',
                              onTap: () => Navigator.of(context)
                                  .pushNamed(AppRoutes.accountDeletion),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              key: const Key('landing-header-bar'),
              top: 0,
              left: 0,
              right: 0,
              height: overlayHeight,
              child: _StickyLandingHeader(
                topInset: topInset,
                maxArtWidth: kLandingArtMaxWidth,
                asset: LandingArt.header,
                aspectRatio: LandingArt.headerAspect,
                hotspots: _headerHotspots(context),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MobileLanding extends StatelessWidget {
  const _MobileLanding();

  List<LandingHotspot> _headerHotspots(BuildContext context) {
    return [
      LandingHotspot(
        key: const Key('public-header-entrar'),
        left: 0.52,
        top: 0.18,
        width: 0.45,
        height: 0.68,
        semanticLabel: 'Login/ Cadastre-se',
        onTap: () => goToLogin(context),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final topInset = media.padding.top;
    final pageWidth = media.size.width;
    final headerHeight = pageWidth / MobileLandingArt.headerAspect;
    final overlayHeight = topInset + headerHeight;

    return Scaffold(
      backgroundColor: _kLandingBg,
      body: ColoredBox(
        key: const Key('landing-mobile'),
        color: _kLandingBg,
        child: Stack(
          children: [
            Positioned.fill(
              child: SingleChildScrollView(
                key: const Key('landing-scroll'),
                padding: EdgeInsets.only(top: overlayHeight),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    LandingArtSlice(
                      key: const Key('landing-art-hero'),
                      asset: MobileLandingArt.hero,
                      aspectRatio: MobileLandingArt.heroAspect,
                      semanticLabel: 'After — O que temos pra hoje?',
                      hotspots: const [
                        LandingHotspot(
                          key: Key('landing-badge-play'),
                          left: 0.04,
                          top: 0.83,
                          width: 0.46,
                          height: 0.11,
                          semanticLabel: 'Google Play',
                        ),
                        LandingHotspot(
                          key: Key('landing-badge-store'),
                          left: 0.50,
                          top: 0.83,
                          width: 0.46,
                          height: 0.11,
                          semanticLabel: 'App Store',
                        ),
                      ],
                    ),
                    const LandingArtSlice(
                      key: Key('landing-art-intro'),
                      asset: MobileLandingArt.intro,
                      aspectRatio: MobileLandingArt.introAspect,
                      semanticLabel:
                          'Quer saber o que tem de bom no dia, de onde estiver?',
                    ),
                    const LandingArtSlice(
                      key: Key('landing-art-features'),
                      asset: MobileLandingArt.features,
                      aspectRatio: MobileLandingArt.featuresAspect,
                      semanticLabel:
                          'Descomplique sua busca por diversão e lazer',
                    ),
                    const LandingArtSlice(
                      key: Key('landing-art-business'),
                      asset: MobileLandingArt.business,
                      aspectRatio: MobileLandingArt.businessAspect,
                      semanticLabel:
                          'Cadastre gratuitamente seu estabelecimento no After',
                    ),
                    LandingArtSlice(
                      key: const Key('landing-art-footer'),
                      asset: MobileLandingArt.footer,
                      aspectRatio: MobileLandingArt.footerAspect,
                      semanticLabel: 'Páginas e recursos After',
                      hotspots: [
                        LandingHotspot(
                          key: const Key('public-footer-contact'),
                          left: 0.10,
                          top: 0.450,
                          width: 0.80,
                          height: 0.068,
                          semanticLabel: 'Fale conosco (whats)',
                          onTap: () => Navigator.of(context)
                              .pushNamed(AppRoutes.contact),
                        ),
                        LandingHotspot(
                          key: const Key('public-footer-privacy'),
                          left: 0.10,
                          top: 0.520,
                          width: 0.80,
                          height: 0.068,
                          semanticLabel: 'Política de Privacidade',
                          onTap: () => Navigator.of(context)
                              .pushNamed(AppRoutes.privacy),
                        ),
                        LandingHotspot(
                          key: const Key('public-footer-deletion'),
                          left: 0.10,
                          top: 0.590,
                          width: 0.80,
                          height: 0.068,
                          semanticLabel: 'Exclusão de conta',
                          onTap: () => Navigator.of(context)
                              .pushNamed(AppRoutes.accountDeletion),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              key: const Key('landing-header-bar'),
              top: 0,
              left: 0,
              right: 0,
              height: overlayHeight,
              child: _StickyLandingHeader(
                topInset: topInset,
                asset: MobileLandingArt.header,
                aspectRatio: MobileLandingArt.headerAspect,
                hotspots: _headerHotspots(context),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Fixed header: glass tint + blur, with a short fade at the bottom so the
/// bar does not read as a solid slab over the scrolling art.
class _StickyLandingHeader extends StatelessWidget {
  const _StickyLandingHeader({
    required this.topInset,
    required this.asset,
    required this.aspectRatio,
    required this.hotspots,
    this.maxArtWidth,
  });

  final double topInset;
  final String asset;
  final double aspectRatio;
  final List<LandingHotspot> hotspots;
  final double? maxArtWidth;

  @override
  Widget build(BuildContext context) {
    Widget art = LandingArtSlice(
      key: const Key('landing-art-header'),
      asset: asset,
      aspectRatio: aspectRatio,
      semanticLabel: 'After',
      hotspots: hotspots,
    );
    if (maxArtWidth != null) {
      art = Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxArtWidth!),
          child: art,
        ),
      );
    }

    return ClipRect(
      child: ShaderMask(
        blendMode: BlendMode.dstIn,
        shaderCallback: (bounds) {
          return const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xFFFFFFFF),
              Color(0xFFFFFFFF),
              Color(0x00FFFFFF),
            ],
            stops: [0.0, 0.90, 1.0],
          ).createShader(bounds);
        },
        child: BackdropFilter(
          filter: ImageFilter.blur(
            sigmaX: _kHeaderBlurSigma,
            sigmaY: _kHeaderBlurSigma,
          ),
          child: ColoredBox(
            color: _kHeaderGlassTint,
            child: Padding(
              padding: EdgeInsets.only(top: topInset),
              child: Opacity(
                opacity: _kHeaderArtOpacity,
                child: art,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
