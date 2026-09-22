import 'package:flutter/material.dart';

import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import 'public_chrome.dart';
import 'public_contact.dart';

class ContactPage extends StatelessWidget {
  const ContactPage({super.key});

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 640;
    return PublicPageFrame(
      title: 'Contato | After',
      backgroundColor: Colors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PublicPageHeading(title: 'Entre em contato'),
          const SizedBox(height: 12),
          const Text(
            'Estamos aqui para ajudar. Entre em contato com o After para tirar dúvidas, enviar sugestões, solicitar suporte ou registrar uma reclamação.',
            style: publicBodyStyle,
          ),
          const SizedBox(height: 24),
          const PublicOfficialChannelsCard(),
          const SizedBox(height: 16),
          PublicSectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Termos, privacidade e dados pessoais',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                    color: AppTheme.ink,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Para solicitações relacionadas aos seus dados pessoais, correção de informações, privacidade ou outras questões relacionadas ao tratamento de dados, entre em contato conosco pelos canais acima.',
                  style: publicBodyStyle,
                ),
                const SizedBox(height: 16),
                PublicSecondaryButton(
                  key: const Key('contact-terms'),
                  label: 'Consultar Termos de Uso',
                  expand: compact,
                  onPressed: () {
                    Navigator.of(context).pushNamed(AppRoutes.terms);
                  },
                ),
                const SizedBox(height: 10),
                PublicSecondaryButton(
                  key: const Key('contact-privacy'),
                  label: 'Consultar Política de Privacidade',
                  expand: compact,
                  onPressed: () {
                    Navigator.of(context).pushNamed(AppRoutes.privacy);
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          PublicSectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Exclusão de conta e dados',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                    color: AppTheme.ink,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Se você deseja excluir sua conta do After e solicitar a exclusão dos dados associados, consulte nossa página específica de exclusão de conta.',
                  style: publicBodyStyle,
                ),
                const SizedBox(height: 16),
                PublicPrimaryButton(
                  key: const Key('contact-deletion'),
                  label: 'Solicitar exclusão da conta',
                  expand: compact,
                  onPressed: () {
                    Navigator.of(context).pushNamed(AppRoutes.accountDeletion);
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const PublicSectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Atendimento',
                  style: TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                    color: AppTheme.ink,
                  ),
                ),
                SizedBox(height: 10),
                Text(
                  'Utilize nosso e-mail ou WhatsApp para dúvidas, sugestões, suporte ou reclamações. Nossa equipe analisará sua solicitação e responderá assim que possível.',
                  style: publicBodyStyle,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
