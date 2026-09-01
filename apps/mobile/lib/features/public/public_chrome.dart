import 'package:flutter/material.dart';

import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/after_logo.dart';

void goToPublicHome(BuildContext context) {
  Navigator.of(context).pushNamedAndRemoveUntil(
    AppRoutes.root,
    (route) => false,
  );
}

void goToLogin(BuildContext context) {
  Navigator.of(context).pushNamed(AppRoutes.login);
}

/// Explicit return to `/` — does not use [Navigator.pop], so it works on a
/// cold deep-link with no history.
class PublicHomeLink extends StatelessWidget {
  const PublicHomeLink({super.key});

  static const label = 'Voltar para o início';

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      key: const Key('public-home-back'),
      onPressed: () => goToPublicHome(context),
      style: TextButton.styleFrom(
        foregroundColor: AppTheme.ink,
        minimumSize: const Size(48, 48),
        tapTargetSize: MaterialTapTargetSize.padded,
        textStyle: const TextStyle(
          fontFamily: AppTheme.fontFamily,
          fontWeight: FontWeight.w600,
          fontSize: 14,
        ),
      ),
      icon: const Icon(Icons.arrow_back_rounded, size: 18),
      label: const Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}

class PublicChrome extends StatelessWidget {
  const PublicChrome({
    super.key,
    required this.body,
  });

  final Widget body;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.canvas,
      body: Column(
        children: [
          const _PublicHeader(),
          Expanded(child: body),
          const _PublicFooter(),
        ],
      ),
    );
  }
}

class _PublicHeader extends StatelessWidget {
  const _PublicHeader();

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final compact = width < 640;
    final route = ModalRoute.of(context)?.settings.name;
    final onRoot = route == null || route == AppRoutes.root;

    return Material(
      color: Colors.white,
      elevation: 0,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          border: Border(
            bottom: BorderSide(color: AppTheme.sageBorder, width: 1),
          ),
        ),
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: compact ? 16 : 32,
              vertical: 10,
            ),
            child: compact
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          _PublicLogo(onRoot: onRoot),
                          const Spacer(),
                          _PublicEnterButton(compact: compact),
                        ],
                      ),
                      const PublicHomeLink(),
                    ],
                  )
                : Row(
                    children: [
                      _PublicLogo(onRoot: onRoot),
                      const SizedBox(width: 8),
                      const PublicHomeLink(),
                      const Spacer(),
                      _PublicEnterButton(compact: compact),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

class _PublicLogo extends StatelessWidget {
  const _PublicLogo({required this.onRoot});

  final bool onRoot;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onRoot ? null : () => goToPublicHome(context),
      borderRadius: BorderRadius.circular(8),
      child: Image.asset(
        AfterLogo.assetPath,
        height: 40,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.high,
        semanticLabel: 'After',
      ),
    );
  }
}

class _PublicEnterButton extends StatelessWidget {
  const _PublicEnterButton({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      key: const Key('public-header-entrar'),
      onPressed: () => goToLogin(context),
      style: FilledButton.styleFrom(
        backgroundColor: AppTheme.ink,
        foregroundColor: Colors.white,
        minimumSize: const Size(88, 40),
        padding: EdgeInsets.symmetric(
          horizontal: compact ? 16 : 22,
          vertical: 12,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
        textStyle: const TextStyle(
          fontFamily: AppTheme.fontFamily,
          fontWeight: FontWeight.w700,
          fontSize: 14,
        ),
      ),
      child: const Text('Entrar'),
    );
  }
}

class _PublicFooter extends StatelessWidget {
  const _PublicFooter();

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 640;
    final linkStyle = TextStyle(
      fontFamily: AppTheme.fontFamily,
      fontWeight: FontWeight.w600,
      fontSize: compact ? 12 : 13,
      color: AppTheme.ink,
    );

    return Material(
      color: Colors.white,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          border: Border(
            top: BorderSide(color: AppTheme.sageBorder, width: 1),
          ),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: compact ? 16 : 32,
              vertical: 16,
            ),
            child: Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 16,
              runSpacing: 10,
              children: [
                Text(
                  '© AFTER',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w700,
                    fontSize: compact ? 12 : 13,
                    color: AppTheme.ink,
                  ),
                ),
                Wrap(
                  spacing: compact ? 12 : 20,
                  runSpacing: 8,
                  children: [
                    _FooterLink(
                      label: 'Política de Privacidade',
                      style: linkStyle,
                      onTap: () {
                        Navigator.of(context).pushNamed(AppRoutes.privacy);
                      },
                    ),
                    _FooterLink(
                      label: 'Exclusão de conta',
                      style: linkStyle,
                      onTap: () {
                        Navigator.of(context)
                            .pushNamed(AppRoutes.accountDeletion);
                      },
                    ),
                    _FooterLink(
                      label: 'Contato',
                      style: linkStyle,
                      onTap: () {
                        Navigator.of(context).pushNamed(AppRoutes.contact);
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FooterLink extends StatelessWidget {
  const _FooterLink({
    required this.label,
    required this.style,
    required this.onTap,
  });

  final String label;
  final TextStyle style;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
        child: Text(label, style: style),
      ),
    );
  }
}

class PublicPageFrame extends StatelessWidget {
  const PublicPageFrame({
    super.key,
    required this.child,
    this.maxWidth = 760,
  });

  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 640;
    return PublicChrome(
      body: ColoredBox(
        color: AppTheme.canvas,
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxWidth),
            child: ListView(
              padding: EdgeInsets.fromLTRB(
                compact ? 16 : 28,
                compact ? 24 : 36,
                compact ? 16 : 28,
                40,
              ),
              children: [child],
            ),
          ),
        ),
      ),
    );
  }
}
