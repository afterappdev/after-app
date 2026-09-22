import 'package:flutter/material.dart';

import '../../core/location/open_url.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import 'public_chrome.dart';
import 'public_contact.dart';

class TermsOfUsePage extends StatefulWidget {
  const TermsOfUsePage({super.key});

  static const lastUpdated = '22 de setembro de 2026';

  @override
  State<TermsOfUsePage> createState() => _TermsOfUsePageState();
}

class _TermsOfUsePageState extends State<TermsOfUsePage> {
  late final Map<String, GlobalKey> _keys;

  @override
  void initState() {
    super.initState();
    _keys = {for (final section in _sections) section.id: GlobalKey()};
  }

  static const _sections = <_TermsSection>[
    _TermsSection(
      id: 'aceitacao',
      title: '1. Aceitação dos Termos',
      body:
          'Estes Termos de Uso regulam o acesso e a utilização do After, incluindo aplicativos móveis, site e demais serviços disponibilizados.\n\n'
          'Ao criar uma conta, acessar ou utilizar o After, o usuário declara ter lido e concordado com estes Termos e com a Política de Privacidade.\n\n'
          'Se o usuário não concordar com estes Termos, não deverá utilizar o serviço.',
    ),
    _TermsSection(
      id: 'sobre',
      title: '2. Sobre o After',
      body:
          'O After é um serviço que ajuda pessoas a descobrir estabelecimentos, promoções, eventos e opções próximas, e que permite a estabelecimentos apresentar informações e conteúdos relacionados às suas atividades.\n\n'
          'O After pode ser disponibilizado em aplicativos para iOS e Android e, quando aplicável, na web.\n\n'
          'O After não é parte das relações comerciais realizadas entre usuários e estabelecimentos fora da plataforma, como reservas, consumo no local ou pagamentos feitos diretamente ao estabelecimento.',
    ),
    _TermsSection(
      id: 'cadastro',
      title: '3. Cadastro e contas',
      body:
          'Determinadas funcionalidades exigem cadastro. O usuário deve fornecer informações verdadeiras, completas e atualizadas, e é responsável por manter a confidencialidade de suas credenciais de acesso.\n\n'
          'O usuário deve ter capacidade legal para utilizar o serviço e observar eventuais restrições etárias aplicáveis à loja de aplicativos, à legislação e à região em que se encontra.\n\n'
          'O After pode recusar, restringir ou encerrar contas em caso de informações falsas, uso indevido, violação destes Termos ou risco à segurança do serviço ou de terceiros, pelos mecanismos disponíveis.',
    ),
    _TermsSection(
      id: 'tipos',
      title: '4. Tipos de conta',
      intro: 'O After possui, principalmente, os seguintes tipos de conta:',
      bullets: [
        'conta de usuário (USER), destinada a quem busca estabelecimentos, visualiza conteúdos, avalia, denuncia e, quando aplicável, bloqueia estabelecimentos;',
        'conta de estabelecimento (VENUE), destinada a quem cadastra e gerencia um local, publica informações, fotos, vídeos e promoções, e pode adquirir créditos para funcionalidades do serviço.',
      ],
      body:
          'Cada tipo de conta tem permissões específicas. O usuário não deve utilizar o After de forma incompatível com o tipo de conta cadastrado.',
    ),
    _TermsSection(
      id: 'ugc',
      title: '5. Conteúdo publicado por usuários e estabelecimentos',
      body:
          'O After pode hospedar e exibir conteúdo gerado por usuários e estabelecimentos, conforme as funcionalidades disponíveis, incluindo avaliações, promoções, fotografias, vídeos e informações fornecidas por estabelecimentos, como nome, descrição, categoria, endereço, horários e dados de contato.\n\n'
          'Quem publica conteúdo no After é o único responsável por esse conteúdo. O After não transfere para si a propriedade do conteúdo publicado.\n\n'
          'Ao enviar conteúdo, o usuário ou estabelecimento declara possuir os direitos, licenças e permissões necessários para publicá-lo e para autorizar sua exibição no After.\n\n'
          'Para que o serviço funcione, o usuário ou estabelecimento concede ao After uma licença limitada, não exclusiva, mundial e gratuita para armazenar, processar, reproduzir e exibir esse conteúdo exclusivamente no âmbito do After e de suas funcionalidades, inclusive para moderação, segurança e cumprimento destes Termos.\n\n'
          'Essa licença não representa cessão de titularidade e permanece apenas enquanto o conteúdo estiver associado ao serviço, ressalvados registros que o After precise conservar para segurança, auditoria, prevenção de abuso ou obrigação legal.',
    ),
    _TermsSection(
      id: 'proibido',
      title: '6. Conteúdo proibido',
      intro:
          'É vedado publicar, enviar ou disponibilizar no After conteúdo que, conforme aplicável ao serviço, seja ou contenha:',
      bullets: [
        'material ilegal;',
        'conteúdo ofensivo, abusivo, ameaçador ou que configure assédio;',
        'discriminação ou discurso de ódio;',
        'conteúdo sexualmente explícito ou inadequado ao contexto do After;',
        'violência gratuita ou incentivo a atividade perigosa ou ilícita;',
        'informação fraudulenta, enganosa ou deliberadamente falsa;',
        'spam, publicidade enganosa ou uso do serviço para fins incompatíveis com sua finalidade;',
        'violação de direitos autorais, marcas ou outros direitos de terceiros;',
        'violação da privacidade de terceiros, incluindo divulgação de dados pessoais sem autorização;',
        'qualquer outro conteúdo incompatível com a finalidade do After de apresentar estabelecimentos, eventos e informações relacionadas.',
      ],
      body:
          'O After pode remover, ocultar ou recusar conteúdo que viole esta seção, estes Termos ou a legislação aplicável, sem que isso implique obrigação de monitorar previamente tudo o que é publicado.',
    ),
    _TermsSection(
      id: 'avaliacoes',
      title: '7. Avaliações',
      body:
          'As avaliações expressam a opinião do usuário que as publicou. O After não verifica previamente a veracidade de cada avaliação e não endossa automaticamente as opiniões nelas contidas.\n\n'
          'É proibido publicar avaliações fraudulentas, abusivas, de má-fé ou destinadas a manipular reputação, inclusive avaliações fictícias ou obtidas de forma irregular.\n\n'
          'Avaliações podem ser denunciadas e submetidas a moderação. Quando aplicável, o estabelecimento pode responder à avaliação pelos recursos disponíveis no After.',
    ),
    _TermsSection(
      id: 'midia',
      title: '8. Promoções, fotos e vídeos de estabelecimentos',
      body:
          'Estabelecimentos podem publicar promoções, fotografias, vídeos e demais informações do local, de acordo com as funcionalidades e, quando for o caso, com o uso de créditos.\n\n'
          'O estabelecimento é responsável pela veracidade, atualidade e legalidade dessas informações, inclusive preços, condições promocionais, horários e mídias enviadas.\n\n'
          'O After pode ocultar, cancelar ou remover promoções, fotos e vídeos que violem estes Termos, direitos de terceiros ou a legislação aplicável.',
    ),
    _TermsSection(
      id: 'denuncias',
      title: '9. Denúncias',
      body:
          'Usuários e estabelecimentos podem denunciar conteúdo ou estabelecimentos pelos mecanismos disponíveis no aplicativo, informando um motivo e, quando desejarem, uma descrição complementar.\n\n'
          'A denúncia será analisada. O envio de uma denúncia não garante a remoção automática do conteúdo ou do estabelecimento.\n\n'
          'O After poderá solicitar informações adicionais quando necessário para compreender o caso.\n\n'
          'Registros relacionados à denúncia, incluindo o motivo, a descrição opcional, identificadores do conteúdo e um registro do material denunciado, podem ser preservados para segurança, auditoria, prevenção de abuso e cumprimento de obrigações legais, inclusive se o conteúdo original for posteriormente removido ou ocultado.\n\n'
          'O After não se compromete com um prazo específico de resposta a cada denúncia.',
    ),
    _TermsSection(
      id: 'bloqueio',
      title: '10. Bloqueio de estabelecimentos',
      body:
          'Contas de usuário (USER) podem bloquear um estabelecimento. O bloqueio afeta a experiência daquele usuário: o estabelecimento e seus conteúdos deixam de ser apresentados a ele nas listagens, buscas e acessos diretos correspondentes.\n\n'
          'O bloqueio não significa, por si só, que o estabelecimento foi removido do After ou ocultado para os demais usuários.\n\n'
          'O usuário pode desfazer o bloqueio posteriormente pelos mecanismos disponíveis no aplicativo.',
    ),
    _TermsSection(
      id: 'moderacao',
      title: '11. Moderação e remoção de conteúdo',
      intro:
          'O After pode, quando necessário e de acordo com estes Termos, analisar conteúdo denunciado e adotar medidas como:',
      bullets: [
        'ocultar um estabelecimento;',
        'cancelar ou ocultar uma promoção;',
        'remover uma avaliação;',
        'remover uma fotografia;',
        'remover um vídeo;',
        'reexibir um estabelecimento previamente ocultado, quando apropriado.',
      ],
      body:
          'Essas medidas visam proteger usuários, estabelecimentos e a integridade do serviço. A moderação não implica, automaticamente, o encerramento da conta.\n\n'
          'Em situações graves ou reincidentes, o After poderá restringir o acesso ou encerrar a conta pelos mecanismos disponíveis, inclusive exclusão da conta pelo próprio titular ou pela equipe administrativa. Não há, atualmente, um recurso específico de suspensão temporária automática de conta.\n\n'
          'O After reserva-se o direito de adotar medidas adicionais de restrição quando necessário para proteger o serviço e os usuários.',
    ),
    _TermsSection(
      id: 'encerramento',
      title: '12. Suspensão e encerramento de contas',
      body:
          'O usuário pode solicitar a exclusão de sua conta pelos canais e páginas disponibilizados pelo After.\n\n'
          'O After também pode encerrar contas em caso de violação destes Termos, uso abusivo, risco à segurança, fraude ou obrigação legal, pelos mecanismos administrativos disponíveis.\n\n'
          'Após o encerramento, o acesso à conta é descontinuado. Determinados registros podem ser conservados pelo período necessário a obrigações legais, prevenção de fraude, segurança, auditoria e exercício regular de direitos, conforme a Política de Privacidade.',
    ),
    _TermsSection(
      id: 'creditos',
      title: '13. Créditos e compras dentro do aplicativo',
      body:
          'Estabelecimentos podem adquirir créditos no After para utilizar funcionalidades do serviço, como a publicação ou promoção de conteúdos, conforme a implementação disponível.\n\n'
          'No iOS, compras digitais são processadas pelo sistema de In-App Purchase da Apple. No Android, compras digitais podem ser processadas pelo Google Play. Na web, quando disponibilizado, o pagamento pode ocorrer por PIX ou outro meio integrado ao After.\n\n'
          'O After não define uma política própria de reembolso conflitante com as regras da Apple, do Google Play ou do provedor de pagamento utilizado. Solicitações de reembolso de compras digitais devem seguir as regras da respectiva loja ou provedor.\n\n'
          'O After não armazena números completos de cartão, códigos de segurança ou credenciais bancárias quando o pagamento é processado diretamente pela loja ou pelo provedor.',
    ),
    _TermsSection(
      id: 'responsabilidades',
      title: '14. Responsabilidades dos usuários e estabelecimentos',
      intro: 'Sem prejuízo de outras obrigações destes Termos, o usuário ou estabelecimento deve:',
      bullets: [
        'utilizar o After de forma lícita e compatível com sua finalidade;',
        'ser responsável pelo conteúdo que publica e pelas informações que cadastra;',
        'respeitar direitos de terceiros, inclusive imagem, privacidade e propriedade intelectual;',
        'não tentar burlar mecanismos de denúncia, bloqueio, moderação ou segurança;',
        'não se passar por outra pessoa ou estabelecimento.',
      ],
      body:
          'O After disponibiliza a plataforma e envida esforços razoáveis para seu funcionamento, mas não garante disponibilidade ininterrupta nem a ausência de erros. Na máxima extensão permitida pela legislação aplicável, o After não se responsabiliza por relações, danos ou insatisfações decorrentes de experiências ocorridas no estabelecimento ou fora da plataforma.',
    ),
    _TermsSection(
      id: 'pi',
      title: '15. Propriedade intelectual',
      body:
          'Marcas, logotipos, layout, código e demais elementos do After, com exceção do conteúdo publicado por usuários e estabelecimentos, pertencem ao After ou a seus licenciadores.\n\n'
          'O conteúdo publicado por usuários e estabelecimentos permanece de seus respectivos titulares, observadas a licença limitada descrita nestes Termos e os direitos de terceiros.\n\n'
          'Nada nestes Termos transfere ao usuário qualquer direito sobre a marca After ou sobre o software do serviço, além da autorização de uso necessária para utilizar o aplicativo conforme permitido.',
    ),
    _TermsSection(
      id: 'privacidade',
      title: '16. Privacidade',
      body:
          'O tratamento de dados pessoais no After está descrito na Política de Privacidade, que complementa estes Termos.\n\n'
          'Ao utilizar o After, o usuário também reconhece as práticas descritas na Política de Privacidade.',
    ),
    _TermsSection(
      id: 'alteracoes',
      title: '17. Alterações dos Termos',
      body:
          'Estes Termos poderão ser atualizados para refletir alterações no After, na legislação ou nas práticas do serviço.\n\n'
          'Quando houver alteração relevante, a versão atualizada será disponibilizada nesta página, com a respectiva data de atualização. O uso continuado do After após a publicação da nova versão constitui aceite dos Termos atualizados, salvo disposição legal em contrário.',
    ),
    _TermsSection(
      id: 'contato',
      title: '18. Contato',
      body:
          'Em caso de dúvidas sobre estes Termos de Uso, denúncias, privacidade ou o funcionamento do After, entre em contato:\n\n'
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
      title: 'Termos de Uso | After',
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
                      title: 'Termos de Uso',
                      subtitle:
                          'Última atualização: ${TermsOfUsePage.lastUpdated}',
                    ),
                    const SizedBox(height: 16),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        key: const Key('terms-back'),
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
                            'Estes Termos de Uso explicam as regras para utilizar o After, inclusive em relação a contas, conteúdo publicado, denúncias, bloqueio, moderação e compras no aplicativo.',
                            style: publicBodyStyle,
                          ),
                          SizedBox(height: 12),
                          Text(
                            'O uso do After implica a aceitação destes Termos e da Política de Privacidade.',
                            style: publicBodyStyle,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    for (final section in _sections) ...[
                      KeyedSubtree(
                        key: keys[section.id],
                        child: _TermsBlock(
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
      case 'privacidade':
        return PublicSecondaryButton(
          key: const Key('terms-privacy'),
          label: 'Consultar Política de Privacidade',
          expand: compact,
          onPressed: () {
            Navigator.of(context).pushNamed(AppRoutes.privacy);
          },
        );
      case 'contato':
        return _TermsContactFooter(compact: compact);
      default:
        return null;
    }
  }
}

class _TermsContactFooter extends StatelessWidget {
  const _TermsContactFooter({required this.compact});

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
          onTap: () => openExternalUrl(AfterPublicContact.whatsappUrl),
          child: const Text(
            'WhatsApp: ${AfterPublicContact.whatsappDisplay}',
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
          key: const Key('terms-contact'),
          label: 'Contato',
          expand: compact,
          onPressed: () {
            Navigator.of(context).pushNamed(AppRoutes.contact);
          },
        ),
        const SizedBox(height: 10),
        PublicSecondaryButton(
          key: const Key('terms-privacy-footer'),
          label: 'Política de Privacidade',
          expand: compact,
          onPressed: () {
            Navigator.of(context).pushNamed(AppRoutes.privacy);
          },
        ),
      ],
    );
  }
}

class _TermsSection {
  const _TermsSection({
    required this.id,
    required this.title,
    this.intro,
    this.body,
    this.bullets = const [],
  });

  final String id;
  final String title;
  final String? intro;
  final String? body;
  final List<String> bullets;
}

class _TermsBlock extends StatelessWidget {
  const _TermsBlock({required this.section, this.footer});

  final _TermsSection section;
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
          if (footer != null) ...[const SizedBox(height: 16), footer!],
        ],
      ),
    );
  }
}
