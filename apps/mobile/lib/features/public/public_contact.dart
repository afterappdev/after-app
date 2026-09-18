import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../../core/location/open_url.dart';
import '../../core/theme/app_theme.dart';

class AfterPublicContact {
  static const email = 'contato@app-after.com.br';
  static const whatsappDisplay = '(17) 99647-0194';
  static const whatsappE164 = '5517996470194';
  static const mailtoUrl = 'mailto:contato@app-after.com.br';
  static const whatsappMessage =
      'Olá! Entrei em contato pelo site do After e gostaria de falar com a equipe.';

  static String get whatsappUrl => Uri.https('wa.me', '/$whatsappE164', {
    'text': whatsappMessage,
  }).toString();
}

const publicBodyStyle = TextStyle(
  fontFamily: AppTheme.fontFamily,
  fontWeight: FontWeight.w400,
  fontSize: 15,
  height: 1.55,
  color: Color(0xFF4A524F),
);

const publicMutedStyle = TextStyle(
  fontFamily: AppTheme.fontFamily,
  fontWeight: FontWeight.w600,
  fontSize: 12,
  letterSpacing: 0.4,
  color: AppTheme.muted,
);

class PublicSectionCard extends StatelessWidget {
  const PublicSectionCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.fromLTRB(20, 20, 20, 22),
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.sageBorder),
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}

class PublicPrimaryButton extends StatelessWidget {
  const PublicPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.expand = false,
  });

  final String label;
  final VoidCallback onPressed;
  final Widget? icon;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final labelWidget = Text(
      label,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      textAlign: TextAlign.center,
    );
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: AppTheme.brand,
        foregroundColor: Colors.white,
        minimumSize: Size(expand ? double.infinity : 0, 48),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(
          fontFamily: AppTheme.fontFamily,
          fontWeight: FontWeight.w700,
          fontSize: 14,
        ),
      ),
      child: icon == null
          ? labelWidget
          : Row(
              mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                icon!,
                const SizedBox(width: 8),
                Flexible(child: labelWidget),
              ],
            ),
    );
  }
}

class PublicSecondaryButton extends StatelessWidget {
  const PublicSecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.expand = false,
  });

  final String label;
  final VoidCallback onPressed;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: AppTheme.ink,
        side: const BorderSide(color: AppTheme.sageBorder),
        minimumSize: Size(expand ? double.infinity : 0, 48),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(
          fontFamily: AppTheme.fontFamily,
          fontWeight: FontWeight.w700,
          fontSize: 14,
        ),
      ),
      child: Text(label, textAlign: TextAlign.center),
    );
  }
}

class PublicPageHeading extends StatelessWidget {
  const PublicPageHeading({
    super.key,
    required this.title,
    this.subtitle,
    this.titleKey,
  });

  final String title;
  final String? subtitle;
  final Key? titleKey;

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 640;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          key: titleKey,
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontWeight: FontWeight.w800,
            fontSize: compact ? 28 : 34,
            color: AppTheme.ink,
            height: 1.15,
          ),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 8),
          Text(
            subtitle!,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w500,
              fontSize: 14,
              color: AppTheme.muted,
            ),
          ),
        ],
      ],
    );
  }
}

class PublicOfficialChannelsCard extends StatelessWidget {
  const PublicOfficialChannelsCard({super.key, this.showWhatsAppButton = true});

  final bool showWhatsAppButton;

  @override
  Widget build(BuildContext context) {
    return PublicSectionCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          _ChannelRow(
            icon: const Icon(Icons.mail_outline_rounded, color: AppTheme.brand),
            label: 'E-mail',
            value: AfterPublicContact.email,
            actionKey: const Key('contact-email'),
            actionLabel: 'Enviar e-mail',
            expand: true,
            onPressed: () => openExternalUrl(AfterPublicContact.mailtoUrl),
          ),
          const Divider(height: 1, color: AppTheme.sageBorder),
          _ChannelRow(
            icon: const FaIcon(
              FontAwesomeIcons.whatsapp,
              color: AppTheme.brand,
              size: 20,
            ),
            label: 'WhatsApp',
            value: AfterPublicContact.whatsappDisplay,
            actionKey: const Key('contact-whatsapp'),
            actionLabel: 'Conversar pelo WhatsApp',
            expand: true,
            showAction: showWhatsAppButton,
            onPressed: () => openExternalUrl(AfterPublicContact.whatsappUrl),
          ),
        ],
      ),
    );
  }
}

class _ChannelRow extends StatelessWidget {
  const _ChannelRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.actionLabel,
    required this.onPressed,
    required this.expand,
    this.actionKey,
    this.showAction = true,
  });

  final Widget icon;
  final String label;
  final String value;
  final String actionLabel;
  final VoidCallback onPressed;
  final bool expand;
  final Key? actionKey;
  final bool showAction;

  @override
  Widget build(BuildContext context) {
    final info = Row(
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: AppTheme.sageSoft,
            borderRadius: BorderRadius.circular(14),
          ),
          alignment: Alignment.center,
          child: icon,
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label.toUpperCase(), style: publicMutedStyle),
              const SizedBox(height: 4),
              Text(
                value,
                style: const TextStyle(
                  fontFamily: AppTheme.fontFamily,
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                  color: AppTheme.ink,
                ),
              ),
            ],
          ),
        ),
      ],
    );

    final action = showAction
        ? PublicPrimaryButton(
            key: actionKey,
            label: actionLabel,
            onPressed: onPressed,
            expand: expand,
          )
        : const SizedBox.shrink();

    return InkWell(
      onTap: onPressed,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
        child: expand
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  info,
                  if (showAction) ...[const SizedBox(height: 14), action],
                ],
              )
            : Row(
                children: [
                  Expanded(child: info),
                  if (showAction) ...[const SizedBox(width: 16), action],
                ],
              ),
      ),
    );
  }
}
