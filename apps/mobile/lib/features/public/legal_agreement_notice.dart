import 'package:flutter/material.dart';

import '../../core/router/app_router.dart';

/// Texto de aceite com links internos para Termos e Política.
class LegalAgreementNotice extends StatelessWidget {
  const LegalAgreementNotice({
    super.key,
    this.prefix = 'Ao finalizar, você concorda com nossos ',
    this.textStyle,
    this.linkStyle,
  });

  final String prefix;
  final TextStyle? textStyle;
  final TextStyle? linkStyle;

  @override
  Widget build(BuildContext context) {
    final base = textStyle;
    final link = linkStyle ??
        (base ?? const TextStyle()).copyWith(fontWeight: FontWeight.w600);

    return Text.rich(
      TextSpan(
        style: base,
        children: [
          TextSpan(text: prefix),
          WidgetSpan(
            alignment: PlaceholderAlignment.baseline,
            baseline: TextBaseline.alphabetic,
            child: GestureDetector(
              key: const Key('legal-terms-link'),
              onTap: () => Navigator.of(context).pushNamed(AppRoutes.terms),
              child: Text('Termos de Uso', style: link),
            ),
          ),
          const TextSpan(text: ' e '),
          WidgetSpan(
            alignment: PlaceholderAlignment.baseline,
            baseline: TextBaseline.alphabetic,
            child: GestureDetector(
              key: const Key('legal-privacy-link'),
              onTap: () => Navigator.of(context).pushNamed(AppRoutes.privacy),
              child: Text('Política de Privacidade', style: link),
            ),
          ),
        ],
      ),
      textAlign: TextAlign.center,
    );
  }
}
