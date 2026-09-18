import 'package:flutter/material.dart';

import '../../core/location/open_url.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import 'public_chrome.dart';
import 'public_contact.dart';

class PrivacyPolicyPage extends StatefulWidget {
  const PrivacyPolicyPage({super.key});

  static const lastUpdated = '18 de setembro de 2026';

  @override
  State<PrivacyPolicyPage> createState() => _PrivacyPolicyPageState();
}

class _PrivacyPolicyPageState extends State<PrivacyPolicyPage> {
  late final Map<String, GlobalKey> _keys;

  @override
  void initState() {
    super.initState();
    _keys = {for (final section in _sections) section.id: GlobalKey()};
  }

  static const _sections = <_PrivacySection>[
    _PrivacySection(
      id: 'dados',
      title: '1. Dados que podemos coletar',
      body:
          'Dependendo da forma como o usuário utiliza o After, podemos coletar as seguintes categorias de informações:',
      subsections: [
        _PrivacySub(
          title: '1.1. Informações de contato',
          intro: 'Podemos coletar:',
          bullets: [
            'nome;',
            'endereço de e-mail;',
            'número de telefone;',
            'endereço físico;',
            'outras informações de contato fornecidas pelo usuário ou estabelecimento.',
          ],
          body:
              'Essas informações são utilizadas para criação e gerenciamento da conta, identificação do usuário ou estabelecimento, funcionamento dos recursos do aplicativo, atendimento e comunicação relacionada ao serviço.',
        ),
        _PrivacySub(
          title: '1.2. Localização',
          body:
              'O After pode utilizar dados de localização para permitir funcionalidades baseadas na posição geográfica.\n\n'
              'Para usuários, a localização do dispositivo pode ser utilizada para encontrar e apresentar estabelecimentos, eventos e opções próximas.\n\n'
              'Quando autorizado pelo usuário, o aplicativo poderá acessar localização precisa ou aproximada do dispositivo para executar essas funcionalidades.\n\n'
              'A localização atual utilizada para encontrar locais próximos não é utilizada pelo After para rastrear o usuário entre aplicativos ou sites de outras empresas.\n\n'
              'Para estabelecimentos, informações de endereço e localização do próprio estabelecimento podem ser cadastradas e armazenadas de forma fixa para que o local possa ser encontrado e exibido corretamente no aplicativo.\n\n'
              'O usuário pode controlar as permissões de localização pelas configurações do dispositivo. A desativação poderá limitar funcionalidades que dependam da localização.',
        ),
        _PrivacySub(
          title: '1.3. Conteúdo fornecido pelos usuários e estabelecimentos',
          intro:
              'Estabelecimentos e usuários autorizados podem fornecer conteúdo ao After, incluindo:',
          bullets: [
            'fotografias e imagens;',
            'informações e descrições de estabelecimentos;',
            'promoções;',
            'informações sobre eventos;',
            'informações de contato;',
            'outros conteúdos necessários à utilização das funcionalidades da plataforma.',
          ],
          body:
              'Esses conteúdos podem ser armazenados e exibidos no After de acordo com a finalidade para a qual foram enviados.\n\n'
              'O usuário ou estabelecimento que enviar conteúdo declara possuir os direitos, licenças ou autorizações necessárias para sua utilização e exibição no After.',
        ),
        _PrivacySub(
          title: '1.4. Identificadores de usuário',
          body:
              'O After utiliza identificadores internos de conta para autenticação, gerenciamento da conta e associação das informações e funcionalidades ao usuário ou estabelecimento correspondente.\n\n'
              'Esses identificadores podem ser associados aos dados da respectiva conta.',
        ),
        _PrivacySub(
          title: '1.5. Histórico de compras',
          intro:
              'Quando um estabelecimento adquire créditos no After, podemos registrar informações relacionadas à transação, como:',
          bullets: [
            'pacote adquirido;',
            'quantidade de créditos;',
            'valor da operação;',
            'data da compra;',
            'plataforma utilizada;',
            'identificador da transação;',
            'status da compra.',
          ],
          body:
              'Essas informações são utilizadas para confirmar a compra, adicionar os créditos correspondentes, manter o histórico de transações, prevenir duplicidades e permitir o funcionamento do sistema de créditos.\n\n'
              'Os dados completos de cartão ou credenciais financeiras utilizados no pagamento não são armazenados pelo After quando o pagamento é processado diretamente por plataformas ou provedores de pagamento.\n\n'
              'No iOS, compras digitais podem ser processadas pela Apple App Store.\n'
              'No Android, compras digitais podem ser processadas pelo Google Play.\n'
              'Nos serviços Web, quando disponibilizado, pagamentos podem ser processados por provedor de pagamento integrado ao After.\n\n'
              'Cada plataforma ou provedor poderá tratar dados de acordo com sua própria política de privacidade.',
        ),
      ],
    ),
    _PrivacySection(
      id: 'uso',
      title: '2. Como utilizamos os dados',
      intro: 'Os dados coletados pelo After podem ser utilizados para:',
      bullets: [
        'criar, autenticar e administrar contas;',
        'permitir o cadastro e gerenciamento de estabelecimentos;',
        'exibir estabelecimentos e eventos;',
        'encontrar locais próximos ao usuário;',
        'publicar e exibir promoções;',
        'processar e confirmar compras de créditos;',
        'manter carteira e histórico de créditos;',
        'prevenir fraudes, abusos e transações duplicadas;',
        'manter a segurança e o funcionamento do serviço;',
        'prestar suporte e responder dúvidas, solicitações ou reclamações;',
        'cumprir obrigações legais e regulatórias.',
      ],
      body:
          'O After não utiliza os dados declarados nesta política para rastrear usuários entre aplicativos e sites de outras empresas para fins de publicidade direcionada.',
    ),
    _PrivacySection(
      id: 'vinculo',
      title: '3. Dados vinculados à conta',
      intro:
          'Algumas informações podem permanecer vinculadas à identidade ou conta do usuário ou estabelecimento, incluindo, conforme aplicável:',
      bullets: [
        'nome;',
        'e-mail;',
        'telefone;',
        'endereço;',
        'informações adicionais de contato;',
        'identificador da conta;',
        'conteúdo enviado;',
        'fotos e imagens;',
        'histórico de compras.',
      ],
      body:
          'Essa vinculação é necessária para o funcionamento das respectivas funcionalidades do After.\n\n'
          'A localização atual do usuário utilizada para encontrar estabelecimentos próximos não é utilizada para rastreamento.',
    ),
    _PrivacySection(
      id: 'compartilhamento',
      title: '4. Compartilhamento e prestadores de serviço',
      intro:
          'O After poderá utilizar prestadores de serviço e plataformas tecnológicas necessários ao funcionamento do aplicativo, incluindo serviços de:',
      bullets: [
        'hospedagem e infraestrutura;',
        'autenticação;',
        'armazenamento;',
        'envio de notificações;',
        'processamento de pagamentos;',
        'distribuição dos aplicativos;',
        'segurança e operação técnica.',
      ],
      body:
          'Esses terceiros poderão processar os dados necessários à prestação dos respectivos serviços, sujeitos às suas próprias obrigações de segurança, privacidade e proteção de dados.\n\n'
          'O After não vende dados pessoais dos usuários.\n\n'
          'O After não compartilha dados pessoais com redes de publicidade para rastreamento entre aplicativos ou sites de terceiros, salvo se essa prática vier a ser implementada futuramente mediante atualização desta Política e obtenção das permissões legalmente necessárias.',
    ),
    _PrivacySection(
      id: 'pagamentos',
      title: '5. Pagamentos',
      body:
          'As compras realizadas nos aplicativos móveis podem ser processadas pelas respectivas lojas de aplicativos.\n\n'
          'O After não recebe nem armazena números completos de cartão, códigos de segurança ou credenciais bancárias quando essas informações são fornecidas diretamente ao processador de pagamento.\n\n'
          'O After poderá receber informações necessárias para confirmar uma transação, identificar o produto adquirido e disponibilizar os créditos correspondentes.',
    ),
    _PrivacySection(
      id: 'retencao',
      title: '6. Armazenamento e retenção',
      intro: 'Os dados são mantidos pelo período necessário para:',
      bullets: [
        'fornecer os serviços do After;',
        'manter a conta ativa;',
        'cumprir obrigações legais ou regulatórias;',
        'resolver disputas;',
        'prevenir fraudes;',
        'manter registros necessários de transações.',
      ],
      body:
          'Quando os dados deixarem de ser necessários e não existir obrigação legal ou outra base legítima para sua conservação, poderão ser excluídos ou anonimizados de forma adequada.',
    ),
    _PrivacySection(
      id: 'seguranca',
      title: '7. Segurança',
      body:
          'O After adota medidas técnicas e organizacionais destinadas a proteger os dados contra acesso não autorizado, perda, alteração, divulgação ou destruição indevida.\n\n'
          'Apesar dessas medidas, nenhum sistema conectado à internet pode garantir segurança absoluta.',
    ),
    _PrivacySection(
      id: 'direitos',
      title: '8. Direitos e opções do usuário',
      intro:
          'O usuário poderá, conforme aplicável e de acordo com a legislação vigente:',
      bullets: [
        'solicitar confirmação da existência de tratamento de dados;',
        'solicitar acesso aos seus dados;',
        'solicitar correção de dados incompletos, inexatos ou desatualizados;',
        'solicitar atualização de informações;',
        'solicitar exclusão da conta e de dados pessoais;',
        'solicitar informações sobre o tratamento dos seus dados;',
        'revogar consentimentos quando aplicável;',
        'solicitar esclarecimentos relacionados à privacidade.',
      ],
      body:
          'Solicitações relacionadas à privacidade podem ser realizadas pelos canais oficiais de contato do After.\n\n'
          'Para solicitar especificamente a exclusão da conta, disponibilizamos uma página própria.',
    ),
    _PrivacySection(
      id: 'exclusao',
      title: '9. Exclusão de conta e dados',
      body:
          'O After disponibiliza uma página específica com informações e orientações para exclusão da conta.\n\n'
          'O usuário poderá solicitar a exclusão de sua conta e dos dados pessoais associados conforme as instruções apresentadas nessa página.\n\n'
          'Após a solicitação, os dados serão tratados conforme as obrigações legais e os períodos de retenção aplicáveis.\n\n'
          'Dados cuja manutenção não seja necessária para cumprimento de obrigação legal, regulatória, prevenção de fraude, segurança ou exercício regular de direitos serão excluídos ou anonimizados conforme aplicável.',
    ),
    _PrivacySection(
      id: 'permissoes',
      title: '10. Permissões do dispositivo',
      body:
          'Determinadas funcionalidades podem solicitar permissões do dispositivo, como acesso à localização ou às fotos.\n\n'
          'Essas permissões são solicitadas quando necessárias para as funcionalidades correspondentes.\n\n'
          'O usuário pode revisar ou revogar permissões nas configurações do dispositivo. Algumas funcionalidades poderão deixar de funcionar corretamente caso uma permissão necessária seja desativada.',
    ),
    _PrivacySection(
      id: 'menores',
      title: '11. Crianças e adolescentes',
      body:
          'O After não é direcionado especificamente a crianças.\n\n'
          'Determinados conteúdos exibidos no aplicativo podem envolver estabelecimentos, eventos ou referências a bebidas alcoólicas.\n\n'
          'A classificação etária e demais restrições aplicáveis deverão ser observadas de acordo com a loja de aplicativos, legislação e região do usuário.',
    ),
    _PrivacySection(
      id: 'terceiros',
      title: '12. Links e serviços de terceiros',
      body:
          'O After poderá disponibilizar links ou integrações com serviços de terceiros, como redes sociais, aplicativos de comunicação, lojas de aplicativos e serviços de pagamento.\n\n'
          'Ao acessar serviços externos, o usuário estará sujeito também aos termos e políticas de privacidade desses terceiros.',
    ),
    _PrivacySection(
      id: 'mudancas',
      title: '13. Alterações desta Política',
      body:
          'Esta Política de Privacidade poderá ser atualizada para refletir alterações no After, mudanças legais, regulatórias ou nas práticas de tratamento de dados.\n\n'
          'Quando houver alteração relevante, a versão atualizada será disponibilizada nesta página com a respectiva data de atualização.',
    ),
    _PrivacySection(
      id: 'contato',
      title: '14. Contato',
      body:
          'Em caso de dúvidas sobre esta Política de Privacidade, tratamento de dados pessoais, sugestões, solicitações ou reclamações, entre em contato:\n\n'
          'After',
    ),
  ];

  void _scrollTo(String id) {
    final key = _keys[id];
    if (key?.currentContext == null) return;
    Scrollable.ensureVisible(
      key!.currentContext!,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
      alignment: 0.08,
    );
  }

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 640;
    final keys = _keys;

    return Title(
      title: 'Política de Privacidade | After',
      color: AppTheme.ink,
      child: PublicChrome(
        body: ColoredBox(
          color: Colors.white,
          child: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(
                  compact ? 16 : 28,
                  compact ? 24 : 36,
                  compact ? 16 : 28,
                  40,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const PublicPageHeading(
                      title: 'Política de Privacidade',
                      subtitle:
                          'Última atualização: ${PrivacyPolicyPage.lastUpdated}',
                    ),
                    const SizedBox(height: 16),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        key: const Key('privacy-back'),
                        onPressed: () => goToPublicHome(context),
                        child: const Text('Voltar para o início'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    PublicSectionCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Nesta página',
                            style: TextStyle(
                              fontFamily: AppTheme.fontFamily,
                              fontWeight: FontWeight.w800,
                              fontSize: 15,
                              color: AppTheme.ink,
                            ),
                          ),
                          const SizedBox(height: 8),
                          for (final section in _sections)
                            TextButton(
                              onPressed: () => _scrollTo(section.id),
                              style: TextButton.styleFrom(
                                alignment: Alignment.centerLeft,
                                padding: const EdgeInsets.symmetric(
                                  vertical: 4,
                                ),
                                foregroundColor: AppTheme.ink,
                                textStyle: const TextStyle(
                                  fontFamily: AppTheme.fontFamily,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14,
                                ),
                              ),
                              child: Text(section.title),
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
                            'O After respeita a privacidade de seus usuários e está comprometido com a proteção dos dados pessoais tratados por meio de seus aplicativos, site e serviços.',
                            style: publicBodyStyle,
                          ),
                          SizedBox(height: 12),
                          Text(
                            'Esta Política de Privacidade explica quais informações podem ser coletadas, como são utilizadas, armazenadas e protegidas, bem como os direitos e opções disponíveis aos usuários.',
                            style: publicBodyStyle,
                          ),
                          SizedBox(height: 12),
                          Text(
                            'Ao utilizar o After, o usuário reconhece as práticas descritas nesta Política de Privacidade.',
                            style: publicBodyStyle,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    for (final section in _sections) ...[
                      KeyedSubtree(
                        key: keys[section.id],
                        child: _PrivacyBlock(
                          section: section,
                          footer: _footerFor(section.id, compact),
                        ),
                      ),
                      const SizedBox(height: 14),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget? _footerFor(String id, bool compact) {
    switch (id) {
      case 'direitos':
        return PublicPrimaryButton(
          key: const Key('privacy-request-deletion'),
          label: 'Solicitar exclusão da conta',
          expand: compact,
          onPressed: () {
            Navigator.of(context).pushNamed(AppRoutes.accountDeletion);
          },
        );
      case 'exclusao':
        return PublicPrimaryButton(
          key: const Key('privacy-deletion-cta'),
          label: 'Exclusão de conta e dados',
          expand: compact,
          onPressed: () {
            Navigator.of(context).pushNamed(AppRoutes.accountDeletion);
          },
        );
      case 'contato':
        return _PrivacyContactFooter(compact: compact);
      default:
        return null;
    }
  }
}

class _PrivacyContactFooter extends StatelessWidget {
  const _PrivacyContactFooter({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 4),
        InkWell(
          onTap: () => openExternalUrl(AfterPublicContact.mailtoUrl),
          child: const Text(
            'E-mail: ${AfterPublicContact.email}',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w600,
              fontSize: 15,
              height: 1.55,
              color: AppTheme.brand,
            ),
          ),
        ),
        const SizedBox(height: 6),
        InkWell(
          onTap: () => openExternalUrl(AfterPublicContact.telUrl),
          child: const Text(
            'Telefone e WhatsApp: ${AfterPublicContact.phoneDisplay}',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w600,
              fontSize: 15,
              height: 1.55,
              color: AppTheme.brand,
            ),
          ),
        ),
        const SizedBox(height: 16),
        PublicPrimaryButton(
          key: const Key('privacy-contact'),
          label: 'Contato',
          expand: compact,
          onPressed: () {
            Navigator.of(context).pushNamed(AppRoutes.contact);
          },
        ),
        const SizedBox(height: 10),
        PublicSecondaryButton(
          key: const Key('privacy-contact-deletion'),
          label: 'Exclusão de conta',
          expand: compact,
          onPressed: () {
            Navigator.of(context).pushNamed(AppRoutes.accountDeletion);
          },
        ),
      ],
    );
  }
}

class _PrivacySection {
  const _PrivacySection({
    required this.id,
    required this.title,
    this.intro,
    this.body,
    this.bullets = const [],
    this.subsections = const [],
  });

  final String id;
  final String title;
  final String? intro;
  final String? body;
  final List<String> bullets;
  final List<_PrivacySub> subsections;
}

class _PrivacySub {
  const _PrivacySub({
    required this.title,
    this.intro,
    this.body,
    this.bullets = const [],
  });

  final String title;
  final String? intro;
  final String? body;
  final List<String> bullets;
}

class _PrivacyBlock extends StatelessWidget {
  const _PrivacyBlock({required this.section, this.footer});

  final _PrivacySection section;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return PublicSectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            section.title,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w800,
              fontSize: 18,
              color: AppTheme.ink,
            ),
          ),
          if (section.intro != null) ...[
            const SizedBox(height: 10),
            Text(section.intro!, style: publicBodyStyle),
          ],
          if (section.bullets.isNotEmpty) ...[
            const SizedBox(height: 10),
            for (final item in section.bullets)
              Padding(
                padding: const EdgeInsets.only(bottom: 6, left: 2),
                child: Text('• $item', style: publicBodyStyle),
              ),
          ],
          if (section.body != null) ...[
            const SizedBox(height: 10),
            Text(section.body!, style: publicBodyStyle),
          ],
          for (final sub in section.subsections) ...[
            const SizedBox(height: 18),
            Text(
              sub.title,
              style: const TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w800,
                fontSize: 16,
                color: AppTheme.ink,
              ),
            ),
            if (sub.intro != null) ...[
              const SizedBox(height: 8),
              Text(sub.intro!, style: publicBodyStyle),
            ],
            if (sub.bullets.isNotEmpty) ...[
              const SizedBox(height: 8),
              for (final item in sub.bullets)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6, left: 2),
                  child: Text('• $item', style: publicBodyStyle),
                ),
            ],
            if (sub.body != null) ...[
              const SizedBox(height: 8),
              Text(sub.body!, style: publicBodyStyle),
            ],
          ],
          if (footer != null) ...[const SizedBox(height: 16), footer!],
        ],
      ),
    );
  }
}
