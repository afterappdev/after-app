import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/after_logo.dart';
import 'public_chrome.dart';

class LandingProtoAssets {
  static const heroText = 'assets/images/landing_proto/landing_hero_text.png';
  static const heroPhones =
      'assets/images/landing_proto/landing_hero_phones.jpg';
  static const featuresText =
      'assets/images/landing_proto/landing_features_text.png';
  static const filterPhone =
      'assets/images/landing_proto/landing_filter_phone.png';
  static const store = 'assets/images/landing_proto/landing_store.png';
  static const growth = 'assets/images/landing_proto/landing_growth.png';
  static const footerBrand =
      'assets/images/landing_proto/landing_footer_brand.png';
}

/// Mobile chrome / tests. Two-column hero/features start at [kLandingTwoColMin].
const double kLandingMobileBreakpoint = 768;
const double kLandingTwoColMin = 900;
const double kLandingDesktopBreakpoint = 1024;
const double kLandingMaxWidth = 1320;

const Color _kVenueWash = Color(0xFFF5F1F8);

double _pagePad(double width) {
  if (width < kLandingMobileBreakpoint) return 16;
  if (width < kLandingDesktopBreakpoint) return 24;
  return 28;
}

double _headerBarHeight(bool compact) => compact ? 56.0 : 82.0;

double _headerOverlay(double top, bool compact) {
  return top + 8 + _headerBarHeight(compact) + 6;
}

class LandingPage extends StatefulWidget {
  const LandingPage({super.key});

  @override
  State<LandingPage> createState() => _LandingPageState();
}

class _LandingPageState extends State<LandingPage> {
  final _scroll = ScrollController();
  final _menuButtonKey = GlobalKey();
  bool _menuOpen = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    for (final asset in const [
      LandingProtoAssets.heroText,
      LandingProtoAssets.heroPhones,
      LandingProtoAssets.featuresText,
      LandingProtoAssets.filterPhone,
      LandingProtoAssets.store,
      LandingProtoAssets.growth,
      LandingProtoAssets.footerBrand,
    ]) {
      precacheImage(AssetImage(asset), context);
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _closeMenu() {
    if (_menuOpen) setState(() => _menuOpen = false);
  }

  void _toggleMenu() {
    setState(() => _menuOpen = !_menuOpen);
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final compact = width < kLandingMobileBreakpoint;
    final top = MediaQuery.paddingOf(context).top;
    final overlay = _headerOverlay(top, compact);

    return Scaffold(
      backgroundColor: Colors.white,
      body: CallbackShortcuts(
        bindings: {
          const SingleActivator(LogicalKeyboardKey.escape): _closeMenu,
        },
        child: Focus(
          autofocus: true,
          child: ColoredBox(
            key: const Key('landing-page'),
            color: Colors.white,
            child: Stack(
              clipBehavior: Clip.hardEdge,
              children: [
                ColoredBox(
                  key: Key(compact ? 'landing-mobile' : 'landing-desktop'),
                  color: Colors.white,
                  child: AbsorbPointer(
                    absorbing: _menuOpen,
                    child: SingleChildScrollView(
                      key: const Key('landing-scroll'),
                      controller: _scroll,
                      physics: _menuOpen
                          ? const NeverScrollableScrollPhysics()
                          : const BouncingScrollPhysics(
                              parent: AlwaysScrollableScrollPhysics(),
                            ),
                      child: Column(
                        children: [
                          SizedBox(height: overlay),
                          KeyedSubtree(
                            key: const Key('landing-art-hero'),
                            child: _HeroSection(compact: compact),
                          ),
                          KeyedSubtree(
                            key: const Key('landing-art-features'),
                            child: _FeaturesSection(compact: compact),
                          ),
                          KeyedSubtree(
                            key: const Key('landing-art-business'),
                            child: _VenueSection(compact: compact),
                          ),
                          KeyedSubtree(
                            key: const Key('landing-art-footer'),
                            child: _FooterSection(compact: compact),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  key: const Key('landing-header-bar'),
                  top: 0,
                  left: 0,
                  right: 0,
                  child: ColoredBox(
                    color: const Color(0xFFFFFFFF),
                    child: SizedBox(
                      width: double.infinity,
                      height: overlay,
                      child: _LandingHeader(
                        menuOpen: _menuOpen,
                        menuButtonKey: _menuButtonKey,
                        onToggleMenu: _toggleMenu,
                        onLogin: () {
                          _closeMenu();
                          goToLogin(context);
                        },
                      ),
                    ),
                  ),
                ),
                if (_menuOpen) ...[
                  Positioned.fill(
                    child: GestureDetector(
                      onTap: _closeMenu,
                      behavior: HitTestBehavior.opaque,
                      child: const ColoredBox(color: Color(0x14000000)),
                    ),
                  ),
                  _MenuDropdown(anchorKey: _menuButtonKey, onClose: _closeMenu),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LandingHeader extends StatelessWidget {
  const _LandingHeader({
    required this.menuOpen,
    required this.menuButtonKey,
    required this.onToggleMenu,
    required this.onLogin,
  });

  final bool menuOpen;
  final GlobalKey menuButtonKey;
  final VoidCallback onToggleMenu;
  final VoidCallback onLogin;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final compact = width < kLandingMobileBreakpoint;
    final top = MediaQuery.paddingOf(context).top;
    final pad = _pagePad(width);

    return Padding(
      padding: EdgeInsets.fromLTRB(pad, top + 8, pad, 6),
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: kLandingMaxWidth),
          child: Material(
            key: const Key('landing-art-header'),
            color: Colors.white,
            elevation: 0,
            borderRadius: BorderRadius.circular(22),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(22),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x1F000000),
                    blurRadius: 18,
                    offset: Offset(0, 4),
                  ),
                ],
              ),
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  compact ? 12 : 28,
                  compact ? 8 : 16,
                  compact ? 4 : 18,
                  compact ? 8 : 16,
                ),
                child: SizedBox(
                  height: compact ? 40 : 50,
                  child: Row(
                    children: [
                      SizedBox(
                        height: compact ? 28 : 46,
                        width: compact ? 88 : 142,
                        child: Image.asset(
                          AfterLogo.assetPath,
                          fit: BoxFit.contain,
                          alignment: Alignment.centerLeft,
                          filterQuality: FilterQuality.high,
                          semanticLabel: 'After',
                        ),
                      ),
                      const Spacer(),
                      _LoginCadastroButton(compact: compact, onTap: onLogin),
                      SizedBox(width: compact ? 2 : 10),
                      SizedBox(
                        key: menuButtonKey,
                        width: compact ? 40 : 48,
                        height: compact ? 40 : 48,
                        child: IconButton(
                          key: const Key('landing-menu-button'),
                          tooltip: menuOpen ? 'Fechar menu' : 'Abrir menu',
                          onPressed: onToggleMenu,
                          mouseCursor: SystemMouseCursors.click,
                          visualDensity: VisualDensity.compact,
                          style: IconButton.styleFrom(
                            minimumSize: Size(
                              compact ? 40 : 48,
                              compact ? 40 : 48,
                            ),
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            padding: const EdgeInsets.all(8),
                          ),
                          icon: Icon(
                            menuOpen ? Icons.close_rounded : Icons.menu_rounded,
                            size: compact ? 24 : 28,
                          ),
                          color: const Color(0xFF1A1A1A),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MenuDropdown extends StatelessWidget {
  const _MenuDropdown({required this.anchorKey, required this.onClose});

  final GlobalKey anchorKey;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final box = anchorKey.currentContext?.findRenderObject() as RenderBox?;
    final offset = box?.localToGlobal(Offset.zero) ?? Offset.zero;
    final size = box?.size ?? Size.zero;
    final top = offset.dy + size.height + 8;
    final right = MediaQuery.sizeOf(context).width - offset.dx - size.width;

    return Positioned(
      top: top,
      right: right.clamp(12, 400),
      child: Material(
        color: Colors.white,
        elevation: 8,
        shadowColor: const Color(0x33000000),
        borderRadius: BorderRadius.circular(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 220),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                _MenuItem(
                  label: 'Termos de Uso',
                  onTap: () {
                    onClose();
                    Navigator.of(context).pushNamed(AppRoutes.terms);
                  },
                ),
                _MenuItem(
                  label: 'Política de Privacidade',
                  onTap: () {
                    onClose();
                    Navigator.of(context).pushNamed(AppRoutes.privacy);
                  },
                ),
                _MenuItem(
                  label: 'Exclusão de Conta',
                  onTap: () {
                    onClose();
                    Navigator.of(context).pushNamed(AppRoutes.accountDeletion);
                  },
                ),
                _MenuItem(
                  label: 'Contato',
                  onTap: () {
                    onClose();
                    Navigator.of(context).pushNamed(AppRoutes.contact);
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MenuItem extends StatelessWidget {
  const _MenuItem({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        onTap: onTap,
        mouseCursor: SystemMouseCursors.click,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Text(
            label,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w600,
              fontSize: 15,
              color: Color(0xFF1A1A1A),
            ),
          ),
        ),
      ),
    );
  }
}

class _PagePad extends StatelessWidget {
  const _PagePad({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: kLandingMaxWidth),
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: _pagePad(w)),
          child: child,
        ),
      ),
    );
  }
}

class _HoverTap extends StatefulWidget {
  const _HoverTap({super.key, required this.onTap, required this.child});

  final VoidCallback onTap;
  final Widget child;

  @override
  State<_HoverTap> createState() => _HoverTapState();
}

class _HoverTapState extends State<_HoverTap> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedScale(
          scale: _hover ? 1.015 : 1,
          duration: const Duration(milliseconds: 150),
          curve: Curves.easeOut,
          child: AnimatedOpacity(
            opacity: _hover ? 0.94 : 1,
            duration: const Duration(milliseconds: 150),
            child: widget.child,
          ),
        ),
      ),
    );
  }
}

class _LoginCadastroButton extends StatefulWidget {
  const _LoginCadastroButton({required this.compact, required this.onTap});

  final bool compact;
  final VoidCallback onTap;

  @override
  State<_LoginCadastroButton> createState() => _LoginCadastroButtonState();
}

class _LoginCadastroButtonState extends State<_LoginCadastroButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final h = widget.compact ? 36.0 : 50.0;
    final w = widget.compact ? 132.0 : 200.0;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        key: const Key('public-header-entrar'),
        onTap: widget.onTap,
        behavior: HitTestBehavior.opaque,
        child: Semantics(
          button: true,
          label: 'Login / Cadastro',
          child: AnimatedScale(
            scale: _hover ? 1.015 : 1,
            duration: const Duration(milliseconds: 150),
            curve: Curves.easeOut,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              curve: Curves.easeOut,
              height: h,
              width: w,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(h / 2),
                gradient: const LinearGradient(
                  colors: [
                    Color(0xFFFF7A00),
                    Color(0xFFE91E8C),
                    Color(0xFF6B3CFF),
                  ],
                ),
                boxShadow: [
                  BoxShadow(
                    color: Color(_hover ? 0x3D000000 : 0x24000000),
                    blurRadius: _hover ? 10 : 6,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              child: Opacity(
                opacity: _hover ? 0.94 : 1,
                child: Padding(
                  padding: EdgeInsets.symmetric(
                    horizontal: widget.compact ? 10 : 14,
                  ),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.person_rounded,
                          color: Colors.white,
                          size: widget.compact ? 16 : 20,
                        ),
                        SizedBox(width: widget.compact ? 6 : 8),
                        Text(
                          'Login / Cadastro',
                          maxLines: 1,
                          style: TextStyle(
                            fontFamily: AppTheme.fontFamily,
                            fontWeight: FontWeight.w700,
                            fontSize: widget.compact ? 12 : 15,
                            color: Colors.white,
                            height: 1,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ContainImage extends StatelessWidget {
  const _ContainImage({
    required this.asset,
    this.semanticLabel,
    this.alignment = Alignment.center,
    this.maxHeight,
    this.maxWidth,
    this.width,
  });

  final String asset;
  final String? semanticLabel;
  final Alignment alignment;
  final double? maxHeight;
  final double? maxWidth;
  final double? width;

  @override
  Widget build(BuildContext context) {
    final image = Image.asset(
      asset,
      fit: BoxFit.contain,
      alignment: alignment,
      width: width,
      filterQuality: FilterQuality.high,
      gaplessPlayback: true,
      semanticLabel: semanticLabel,
    );
    if (maxHeight == null && maxWidth == null) return image;
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: maxHeight ?? double.infinity,
        maxWidth: maxWidth ?? double.infinity,
      ),
      child: image,
    );
  }
}

class _HeroSection extends StatelessWidget {
  const _HeroSection({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final stacked = MediaQuery.sizeOf(context).width < kLandingTwoColMin;
    final text = _StoreBadgeHotspots(
      child: _ContainImage(
        asset: LandingProtoAssets.heroText,
        alignment: Alignment.centerLeft,
        maxHeight: stacked ? 400 : 520,
        semanticLabel:
            'After — O que tem pra hoje? Encontre restaurantes, bares, pubs e shows próximos de você.',
      ),
    );
    final phones = _ContainImage(
      asset: LandingProtoAssets.heroPhones,
      alignment: stacked ? Alignment.center : Alignment.centerRight,
      maxHeight: stacked ? 400 : 610,
      semanticLabel: 'Telas do aplicativo After',
    );

    return _PagePad(
      child: Padding(
        padding: EdgeInsets.only(top: compact ? 2 : 4, bottom: 0),
        child: stacked
            ? Column(
                children: [
                  text,
                  SizedBox(height: compact ? 16 : 20),
                  phones,
                ],
              )
            : Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(flex: 39, child: text),
                  const SizedBox(width: 12),
                  Expanded(flex: 61, child: phones),
                ],
              ),
      ),
    );
  }
}

class _StoreBadgeHotspots extends StatelessWidget {
  const _StoreBadgeHotspots({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final w = constraints.maxWidth;
        final h = constraints.hasBoundedHeight && constraints.maxHeight.isFinite
            ? constraints.maxHeight
            : w * 0.72;
        return Stack(
          alignment: Alignment.centerLeft,
          children: [
            child,
            Positioned(
              left: 0,
              bottom: 0,
              width: (w * 0.46).clamp(120, 185),
              height: (h * 0.18).clamp(44, 72),
              child: GestureDetector(
                key: const Key('landing-badge-play'),
                behavior: HitTestBehavior.translucent,
                onTap: null,
                child: Semantics(
                  button: true,
                  label: 'Google Play',
                  child: const SizedBox.expand(),
                ),
              ),
            ),
            Positioned(
              left: (w * 0.48).clamp(128, 200),
              bottom: 0,
              width: (w * 0.46).clamp(120, 185),
              height: (h * 0.18).clamp(44, 72),
              child: GestureDetector(
                key: const Key('landing-badge-store'),
                behavior: HitTestBehavior.translucent,
                onTap: null,
                child: Semantics(
                  button: true,
                  label: 'App Store',
                  child: const SizedBox.expand(),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _FeaturesSection extends StatelessWidget {
  const _FeaturesSection({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final stacked = MediaQuery.sizeOf(context).width < kLandingTwoColMin;
    final copy = _ContainImage(
      asset: LandingProtoAssets.featuresText,
      alignment: Alignment.centerLeft,
      maxHeight: stacked ? 460 : 620,
      semanticLabel:
          'Descomplique sua busca por diversão e lazer. Promoções, estabelecimentos, filtros e detalhes do local.',
    );
    final phone = _ContainImage(
      asset: LandingProtoAssets.filterPhone,
      alignment: Alignment.center,
      maxHeight: stacked ? 460 : 620,
      semanticLabel: 'Filtros de locais no After',
    );

    return _PagePad(
      child: Padding(
        padding: EdgeInsets.only(
          top: stacked ? 28 : 8,
          bottom: compact ? 36 : 16,
        ),
        child: stacked
            ? Column(children: [copy, const SizedBox(height: 12), phone])
            : Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(flex: 45, child: copy),
                  const SizedBox(width: 4),
                  Expanded(
                    flex: 55,
                    child: Align(alignment: Alignment.centerLeft, child: phone),
                  ),
                ],
              ),
      ),
    );
  }
}

class _VenueSection extends StatelessWidget {
  const _VenueSection({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final stacked =
        MediaQuery.sizeOf(context).width < kLandingDesktopBreakpoint;
    final store = Image.asset(
      LandingProtoAssets.store,
      fit: BoxFit.contain,
      alignment: stacked ? Alignment.bottomCenter : Alignment.bottomLeft,
      filterQuality: FilterQuality.high,
      semanticLabel: 'Estabelecimento no After',
    );
    final growth = Image.asset(
      LandingProtoAssets.growth,
      fit: BoxFit.contain,
      alignment: stacked ? Alignment.bottomCenter : Alignment.centerRight,
      filterQuality: FilterQuality.high,
      semanticLabel: 'Mais visibilidade para o estabelecimento',
    );

    return _PagePad(
      child: Padding(
        padding: EdgeInsets.only(bottom: compact ? 36 : 40),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: _kVenueWash,
            borderRadius: BorderRadius.circular(24),
          ),
          child: stacked
              ? Padding(
                  padding: const EdgeInsets.fromLTRB(18, 20, 18, 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _OwnerCopy(compact: true),
                      const SizedBox(height: 20),
                      LayoutBuilder(
                        builder: (context, constraints) {
                          final storeW = (constraints.maxWidth * 0.46).clamp(
                            110.0,
                            145.0,
                          );
                          final growthW = compact
                              ? (storeW * 0.88).clamp(100.0, 128.0)
                              : (constraints.maxWidth * 0.32).clamp(72.0, 95.0);
                          final rowH = storeW * 1.23;
                          return Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Expanded(
                                child: Align(
                                  alignment: Alignment.bottomCenter,
                                  child: SizedBox(
                                    width: storeW,
                                    height: rowH,
                                    child: store,
                                  ),
                                ),
                              ),
                              SizedBox(
                                width: constraints.maxWidth < 360 ? 8 : 12,
                              ),
                              Expanded(
                                child: Align(
                                  alignment: Alignment.bottomCenter,
                                  child: SizedBox(
                                    width: growthW,
                                    height: rowH,
                                    child: growth,
                                  ),
                                ),
                              ),
                            ],
                          );
                        },
                      ),
                    ],
                  ),
                )
              : SizedBox(
                  height: 328,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        flex: 25,
                        child: Padding(
                          padding: const EdgeInsets.only(
                            left: 8,
                            bottom: 4,
                            top: 8,
                          ),
                          child: Align(
                            alignment: Alignment.bottomLeft,
                            child: store,
                          ),
                        ),
                      ),
                      Expanded(
                        flex: 49,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: _OwnerCopy(compact: false),
                          ),
                        ),
                      ),
                      Expanded(
                        flex: 26,
                        child: Padding(
                          padding: const EdgeInsets.only(
                            right: 12,
                            top: 10,
                            bottom: 10,
                          ),
                          child: Align(
                            alignment: Alignment.centerRight,
                            child: growth,
                          ),
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

class _OwnerCopy extends StatelessWidget {
  const _OwnerCopy({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final titleSize = compact ? 22.0 : 28.0;
    final bodySize = compact ? 13.5 : 15.5;
    const title = TextStyle(
      fontFamily: AppTheme.fontFamily,
      fontWeight: FontWeight.w800,
      color: Color(0xFF1A1A1A),
      height: 1.12,
    );
    const body = TextStyle(
      fontFamily: AppTheme.fontFamily,
      fontWeight: FontWeight.w500,
      color: Color(0xFF3A3A42),
      height: 1.42,
    );

    return Semantics(
      label:
          'Você, dono de estabelecimento, não fique de fora. Cadastre gratuitamente seu local.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Você, dono de\nestabelecimento,',
            style: title.copyWith(fontSize: titleSize),
          ),
          ShaderMask(
            blendMode: BlendMode.srcIn,
            shaderCallback: (bounds) => const LinearGradient(
              colors: [Color(0xFFFF7A00), Color(0xFFE91E8C), Color(0xFF6B3CFF)],
            ).createShader(bounds),
            child: Text(
              'não fique de fora dessa.',
              style: title.copyWith(fontSize: titleSize, color: Colors.white),
            ),
          ),
          SizedBox(height: compact ? 12 : 12),
          Text(
            'Cadastre gratuitamente seu local no aplicativo e tenha uma visibilidade muito maior do que já possui.',
            style: body.copyWith(fontSize: bodySize),
          ),
          SizedBox(height: compact ? 8 : 10),
          Text(
            'Aumente o fluxo de clientes publicando promoções na primeira página do aplicativo.',
            style: body.copyWith(fontSize: bodySize),
          ),
        ],
      ),
    );
  }
}

class _FooterSection extends StatelessWidget {
  const _FooterSection({required this.compact});

  final bool compact;

  static const _mobileTitle = TextStyle(
    fontFamily: AppTheme.fontFamily,
    fontWeight: FontWeight.w700,
    fontSize: 15,
    height: 1.25,
    color: Color(0xFF1A1A1A),
  );

  static const _desktopTitle = TextStyle(
    fontFamily: AppTheme.fontFamily,
    fontWeight: FontWeight.w700,
    fontSize: 18,
    height: 1.25,
    color: Color(0xFF1A1A1A),
  );

  @override
  Widget build(BuildContext context) {
    final year = DateTime.now().year;
    final stacked =
        MediaQuery.sizeOf(context).width < kLandingDesktopBreakpoint;
    final titleStyle = compact ? _mobileTitle : _desktopTitle;
    final brand = Align(
      alignment: stacked ? Alignment.center : Alignment.topLeft,
      child: compact
          ? const _FooterBrand(centered: true)
          : stacked
          ? _ContainImage(
              asset: LandingProtoAssets.footerBrand,
              alignment: Alignment.topCenter,
              semanticLabel: 'After. O que tem pra hoje?',
              width: 142,
              maxWidth: 142,
              maxHeight: 120,
            )
          : const _FooterBrand(centered: false),
    );
    final pages = Column(
      crossAxisAlignment: stacked
          ? CrossAxisAlignment.center
          : CrossAxisAlignment.start,
      children: [
        Text('Páginas', style: titleStyle),
        SizedBox(height: compact ? 13 : 12),
        _FooterLink(
          key: const Key('public-footer-terms'),
          label: 'Termos de Uso',
          compact: compact,
          centered: stacked,
          onTap: () => Navigator.of(context).pushNamed(AppRoutes.terms),
        ),
        _FooterLink(
          key: const Key('public-footer-privacy'),
          label: 'Política de Privacidade',
          compact: compact,
          centered: stacked,
          onTap: () => Navigator.of(context).pushNamed(AppRoutes.privacy),
        ),
        _FooterLink(
          key: const Key('public-footer-deletion'),
          label: 'Exclusão de Conta',
          compact: compact,
          centered: stacked,
          onTap: () =>
              Navigator.of(context).pushNamed(AppRoutes.accountDeletion),
        ),
      ],
    );
    final contact = Column(
      crossAxisAlignment: stacked
          ? CrossAxisAlignment.center
          : CrossAxisAlignment.start,
      children: [
        Text('Fale com a gente', style: titleStyle),
        SizedBox(height: compact ? 9 : 10),
        Text(
          'Tem dúvidas ou sugestões?\nEstamos prontos para te atender!',
          textAlign: stacked ? TextAlign.center : TextAlign.left,
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w400,
            fontSize: compact ? 13 : 15.5,
            height: 1.4,
            color: const Color(0xFF5A5A64),
          ),
        ),
        SizedBox(height: compact ? 11 : 14),
        Align(
          alignment: stacked ? Alignment.center : Alignment.centerLeft,
          child: _WhatsAppButton(
            compact: compact,
            onTap: () => Navigator.of(context).pushNamed(AppRoutes.contact),
          ),
        ),
      ],
    );

    return ColoredBox(
      color: Colors.white,
      child: _PagePad(
        child: Padding(
          padding: EdgeInsets.only(bottom: compact ? 16 : 18, top: 0),
          child: Column(
            children: [
              stacked
                  ? SizedBox(
                      width: double.infinity,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          brand,
                          const SizedBox(height: 32),
                          pages,
                          SizedBox(height: compact ? 28 : 32),
                          contact,
                        ],
                      ),
                    )
                  : Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(flex: 32, child: brand),
                        Expanded(flex: 32, child: pages),
                        Expanded(flex: 36, child: contact),
                      ],
                    ),
              SizedBox(height: compact ? 32 : 24),
              const Divider(height: 1, color: Color(0xFFE8E8EE)),
              SizedBox(height: compact ? 14 : 12),
              Text(
                '© $year After. Todos os direitos reservados.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontSize: compact ? 11.5 : 12,
                  height: 1.35,
                  color: const Color(0xFF6B6B76),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FooterBrand extends StatelessWidget {
  const _FooterBrand({required this.centered});

  final bool centered;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: centered
          ? CrossAxisAlignment.center
          : CrossAxisAlignment.start,
      children: [
        Align(
          alignment: centered ? Alignment.center : Alignment.centerLeft,
          child: Transform.translate(
            offset: Offset(centered ? 24 : 12, 0),
            child: ClipRect(
              child: Align(
                alignment: centered ? Alignment.topCenter : Alignment.topLeft,
                heightFactor: 0.54,
                child: Image.asset(
                  LandingProtoAssets.footerBrand,
                  width: 248,
                  fit: BoxFit.contain,
                  alignment: centered
                      ? Alignment.topCenter
                      : Alignment.centerLeft,
                  filterQuality: FilterQuality.high,
                  semanticLabel: 'After. O que tem pra hoje?',
                ),
              ),
            ),
          ),
        ),
        SizedBox(height: centered ? 10 : 8),
        ConstrainedBox(
          constraints: BoxConstraints(maxWidth: centered ? 260 : 248),
          child: Text(
            'Descubra os melhores lugares, aproveite promoções exclusivas e viva experiências incríveis todos os dias.',
            textAlign: centered ? TextAlign.center : TextAlign.left,
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w400,
              fontSize: centered ? 13 : 12.75,
              height: 1.45,
              color: const Color(0xFF5A5A64),
            ),
          ),
        ),
      ],
    );
  }
}

class _WhatsAppButton extends StatelessWidget {
  const _WhatsAppButton({required this.compact, required this.onTap});

  final bool compact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final h = compact ? 40.0 : 44.0;
    return _HoverTap(
      key: const Key('public-footer-contact'),
      onTap: onTap,
      child: Semantics(
        button: true,
        label: 'Fale com a gente. Falar no WhatsApp',
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: h),
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(h / 2),
              gradient: const LinearGradient(
                colors: [
                  Color(0xFFFF7A00),
                  Color(0xFFE91E8C),
                  Color(0xFF6B3CFF),
                ],
              ),
            ),
            child: Padding(
              padding: EdgeInsets.symmetric(
                horizontal: compact ? 18 : 20,
                vertical: compact ? 10 : 11,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  FaIcon(
                    FontAwesomeIcons.whatsapp,
                    color: Colors.white,
                    size: compact ? 16 : 17,
                  ),
                  SizedBox(width: compact ? 8 : 10),
                  Flexible(
                    child: Text(
                      'Falar no WhatsApp',
                      maxLines: 1,
                      style: TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        fontWeight: compact ? FontWeight.w600 : FontWeight.w700,
                        fontSize: compact ? 13 : 15,
                        color: Colors.white,
                        height: 1,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FooterLink extends StatelessWidget {
  const _FooterLink({
    super.key,
    required this.label,
    required this.onTap,
    this.compact = false,
    this.centered = false,
  });

  final String label;
  final VoidCallback onTap;
  final bool compact;
  final bool centered;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: TextButton(
        onPressed: onTap,
        style: TextButton.styleFrom(
          foregroundColor: const Color(0xFF2A2A32),
          padding: EdgeInsets.symmetric(vertical: compact ? 5 : 6),
          minimumSize: Size(compact ? 0 : 44, compact ? 32 : 40),
          tapTargetSize: compact
              ? MaterialTapTargetSize.shrinkWrap
              : MaterialTapTargetSize.padded,
          alignment: centered ? Alignment.center : Alignment.centerLeft,
          textStyle: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w500,
            fontSize: compact ? 13 : 15.5,
            height: 1.4,
          ),
        ),
        child: Text(
          label,
          textAlign: centered ? TextAlign.center : TextAlign.left,
        ),
      ),
    );
  }
}
