import 'package:flutter/material.dart';

import '../../core/formatters/admin_formatters.dart';
import '../../core/theme/admin_theme.dart';
import '../../core/widgets/status_body.dart';
import '../../data/admin_dashboard.dart';

class DashboardOverview extends StatelessWidget {
  const DashboardOverview({
    super.key,
    required this.data,
    required this.wide,
    required this.compact,
  });

  final AdminDashboard data;
  final bool wide;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final insights = data.insights;
    final cityRows = insights.topCitiesRegistered
        .map((row) => (label: '${row.city}, ${row.state}', count: row.count))
        .toList();
    final categoryRows = insights.topVenueCategoriesRegistered
        .map((row) => (label: row.category, count: row.count))
        .toList();

    final play = data.storeDownloads.googlePlay;
    final app = data.storeDownloads.appStore;
    final playValue =
        play.available && play.total != null ? formatCount(play.total!) : '—';
    final playFootnote = play.available && play.lastDataDate != null
        ? 'Dados até ${formatIsoDateYmd(play.lastDataDate)}'
        : null;
    final appFootnote = app.available && app.lastDataDate != null
        ? 'Dados até ${formatIsoDateYmd(app.lastDataDate)}'
        : null;
    final appValue =
        app.available && app.total != null ? formatCount(app.total!) : '—';
    final playUnavailable = !play.available;
    final appUnavailable = !app.available;
    final site = data.siteTraffic;
    final siteUnavailable = !site.available;
    final siteValue = siteUnavailable
        ? 'Indisponível'
        : formatCount(site.total ?? 0);

    if (compact) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _TotalsHeroCard(
            accounts: data.totals.accounts,
            users: data.totals.users,
            venues: data.totals.venues,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _MetricTile(
                  label: 'Downloads\nPlay Store',
                  storeName: 'Play Store',
                  value: playValue,
                  footnote: playFootnote,
                  unavailable: playUnavailable,
                  brandAsset: 'assets/images/google_play_icon.png',
                  background: const Color(0xFFE8F8EF),
                  centered: true,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MetricTile(
                  label: 'Downloads\nApp Store',
                  storeName: 'App Store',
                  value: appValue,
                  footnote: appFootnote,
                  unavailable: appUnavailable,
                  brandAsset: 'assets/images/app_store_icon.png',
                  background: const Color(0xFFE8F1FF),
                  centered: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _MetricTile(
                  label: 'Visitas\nao site',
                  value: siteValue,
                  unavailable: siteUnavailable,
                  useAfterMark: true,
                  background: const Color(0xFFF4F1FF),
                  centered: true,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MetricTile(
                  label: 'Denúncias\npendentes',
                  value: formatCount(insights.reportsPending),
                  icon: Icons.flag_outlined,
                  tint: const Color(0xFFB42318),
                  background: const Color(0xFFFFF0EE),
                  emphasize: true,
                  centered: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          DashboardTopRankingCard(
            title: 'Top 3 cidades',
            subtitle: 'Mais contas cadastradas',
            headerIcon: Icons.emoji_events_outlined,
            headerTint: AdminTheme.green,
            rankTint: AdminTheme.purple,
            rows: cityRows,
          ),
          const SizedBox(height: 12),
          DashboardTopRankingCard(
            title: 'Top 3 categorias (Locais)',
            subtitle: 'Mais contas cadastradas',
            headerIcon: Icons.star_outline_rounded,
            headerTint: AdminTheme.orange,
            rankTint: AdminTheme.orange,
            rows: categoryRows,
          ),
        ],
      );
    }

    if (wide) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  flex: 5,
                  child: _TotalsHeroCard(
                    accounts: data.totals.accounts,
                    users: data.totals.users,
                    venues: data.totals.venues,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 3,
                child: _MetricTile(
                  label: 'Downloads\nPlay Store',
                  storeName: 'Play Store',
                  value: playValue,
                  footnote: playFootnote,
                  unavailable: playUnavailable,
                  brandAsset: 'assets/images/google_play_icon.png',
                  background: const Color(0xFFE8F8EF),
                  tall: true,
                  centered: true,
                ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 3,
                child: _MetricTile(
                  label: 'Downloads\nApp Store',
                  storeName: 'App Store',
                  value: appValue,
                  footnote: appFootnote,
                  unavailable: appUnavailable,
                  brandAsset: 'assets/images/app_store_icon.png',
                  background: const Color(0xFFE8F1FF),
                  tall: true,
                  centered: true,
                ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  flex: 3,
                  child: _MetricTile(
                    label: 'Visitas\nao site',
                    value: siteValue,
                    unavailable: siteUnavailable,
                    useAfterMark: true,
                    background: const Color(0xFFF4F1FF),
                    tall: true,
                    centered: true,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: _MetricTile(
                    label: 'Denúncias\npendentes',
                    value: formatCount(insights.reportsPending),
                    icon: Icons.flag_outlined,
                    tint: const Color(0xFFE45B20),
                    background: const Color(0xFFFFF6EC),
                    emphasize: true,
                    tall: true,
                    centered: true,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: DashboardTopRankingCard(
                  title: 'Top 3 cidades',
                  subtitle: 'Mais contas cadastradas',
                  headerIcon: Icons.emoji_events_outlined,
                  headerTint: AdminTheme.green,
                  rankTint: AdminTheme.purple,
                  rows: cityRows,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: DashboardTopRankingCard(
                  title: 'Top 3 categorias (Locais)',
                  subtitle: 'Mais contas cadastradas',
                  headerIcon: Icons.star_outline_rounded,
                  headerTint: AdminTheme.orange,
                  rankTint: AdminTheme.orange,
                  rows: categoryRows,
                ),
              ),
            ],
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _TotalsHeroCard(
          accounts: data.totals.accounts,
          users: data.totals.users,
          venues: data.totals.venues,
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _MetricTile(
                label: 'Downloads\nPlay Store',
                storeName: 'Play Store',
                value: playValue,
                footnote: playFootnote,
                unavailable: playUnavailable,
                brandAsset: 'assets/images/google_play_icon.png',
                background: const Color(0xFFE8F8EF),
                centered: true,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _MetricTile(
                label: 'Downloads\nApp Store',
                storeName: 'App Store',
                value: appValue,
                footnote: appFootnote,
                unavailable: appUnavailable,
                brandAsset: 'assets/images/app_store_icon.png',
                background: const Color(0xFFE8F1FF),
                centered: true,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _MetricTile(
                label: 'Visitas\nao site',
                value: siteValue,
                unavailable: siteUnavailable,
                useAfterMark: true,
                background: const Color(0xFFF4F1FF),
                centered: true,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _MetricTile(
                label: 'Denúncias\npendentes',
                value: formatCount(insights.reportsPending),
                icon: Icons.flag_outlined,
                tint: const Color(0xFFB42318),
                background: const Color(0xFFFFF6EC),
                emphasize: true,
                centered: true,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        DashboardTopRankingCard(
          title: 'Top 3 cidades',
          subtitle: 'Mais contas cadastradas',
          headerIcon: Icons.emoji_events_outlined,
          headerTint: AdminTheme.green,
          rankTint: AdminTheme.purple,
          rows: cityRows,
        ),
        const SizedBox(height: 12),
        DashboardTopRankingCard(
          title: 'Top 3 categorias (Locais)',
          subtitle: 'Mais contas cadastradas',
          headerIcon: Icons.star_outline_rounded,
          headerTint: AdminTheme.orange,
          rankTint: AdminTheme.orange,
          rows: categoryRows,
        ),
      ],
    );
  }
}

class _TotalsHeroCard extends StatelessWidget {
  const _TotalsHeroCard({
    required this.accounts,
    required this.users,
    required this.venues,
  });

  final int accounts;
  final int users;
  final int venues;

  static const Color _titleColor = Color(0xFF5D2E24);
  static const Color _splitIcon = Color(0xFF8A8F8E);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF9F2),
        borderRadius: BorderRadius.circular(AdminTheme.radiusLg),
        border: Border.all(color: const Color(0xFFF4E4D8)),
        boxShadow: AdminTheme.cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Column(
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFF0E6DE)),
                ),
                child: const Icon(
                  Icons.groups_outlined,
                  color: AdminTheme.orange,
                  size: 34,
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Contas totais',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  color: _titleColor,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                formatCount(accounts),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 40,
                  height: 1,
                  letterSpacing: -0.5,
                  color: AdminTheme.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          const Divider(height: 1, thickness: 1, color: Color(0xFFE8E0DA)),
          const SizedBox(height: 14),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: _totalsSplit(
                    icon: Icons.people_outline,
                    label: 'Usuários',
                    value: formatCount(users),
                  ),
                ),
                const VerticalDivider(
                  width: 1,
                  thickness: 1,
                  color: Color(0xFFE8E0DA),
                ),
                Expanded(
                  child: _totalsSplit(
                    icon: Icons.storefront_outlined,
                    label: 'Estabelecimentos',
                    value: formatCount(venues),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _totalsSplit({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        children: [
          Icon(icon, color: _splitIcon, size: 26),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    label,
                    maxLines: 1,
                    softWrap: false,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AdminTheme.textSecondary,
                    ),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: AdminTheme.textPrimary,
                    height: 1.1,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.label,
    required this.value,
    this.footnote,
    this.tint = AdminTheme.purple,
    this.icon,
    this.background,
    this.unavailable = false,
    this.useAfterMark = false,
    this.emphasize = false,
    this.tall = false,
    this.centered = false,
    this.horizontal = false,
    this.storeName,
    this.brandAsset,
  });

  final String label;
  final String value;
  final String? footnote;
  final Color tint;
  final IconData? icon;
  final Color? background;
  final bool unavailable;
  final bool useAfterMark;
  final bool emphasize;
  final bool tall;
  final bool centered;
  final bool horizontal;
  final String? storeName;
  final String? brandAsset;

  @override
  Widget build(BuildContext context) {
    final valueColor = emphasize
        ? AdminTheme.textPrimary
        : (unavailable ? AdminTheme.textSecondary : AdminTheme.textPrimary);
    final labelColor =
        emphasize ? const Color(0xFF5D2E24) : AdminTheme.textSecondary;
    final valueSize = tall ? 32.0 : 24.0;
    final borderColor = background != null && background != AdminTheme.background
        ? background!.withValues(alpha: 0.65)
        : AdminTheme.border;

    Widget leadingIcon() {
      if (useAfterMark) {
        return Container(
          width: tall ? 58 : 50,
          height: tall ? 58 : 50,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE8E4F5)),
          ),
          padding: const EdgeInsets.all(6),
          child: Image.asset(
            'assets/images/after_mark.png',
            fit: BoxFit.contain,
            filterQuality: FilterQuality.high,
          ),
        );
      }
      if (brandAsset != null) {
        return Container(
          width: centered ? 52 : (tall ? 58 : 50),
          height: centered ? 52 : (tall ? 58 : 50),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE8E8E8)),
          ),
          padding: const EdgeInsets.all(8),
          child: Image.asset(
            brandAsset!,
            fit: BoxFit.contain,
            filterQuality: FilterQuality.high,
          ),
        );
      }
      return Container(
        width: centered ? 52 : (tall ? 58 : 50),
        height: centered ? 52 : (tall ? 58 : 50),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: emphasize ? const Color(0xFFF9E3D3) : const Color(0xFFE8E8E8),
          ),
        ),
        child: Icon(
          icon,
          color: tint,
          size: centered ? 30 : 28,
        ),
      );
    }

    Widget labelBlock() {
      if (storeName != null && centered) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Text(
              'Downloads',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: tall ? 17 : 15,
                height: 1.2,
                color: AdminTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              storeName!,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: tall ? 14 : 12,
                height: 1.25,
                color: labelColor,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              value,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: valueSize,
                height: 1.05,
                color: valueColor,
              ),
            ),
            if (footnote != null) ...[
              const SizedBox(height: 6),
              Text(
                footnote!,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 11,
                  height: 1.2,
                  color: labelColor,
                ),
              ),
            ],
          ],
        );
      }
      return Column(
        crossAxisAlignment:
            horizontal ? CrossAxisAlignment.start : CrossAxisAlignment.center,
        children: [
          Text(
            label,
            textAlign: horizontal ? TextAlign.start : TextAlign.center,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: tall ? 14 : 12,
              height: 1.3,
              color: labelColor,
            ),
          ),
          SizedBox(height: horizontal ? 6 : 8),
          Text(
            value,
            textAlign: horizontal ? TextAlign.start : TextAlign.center,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: valueSize,
              height: 1.05,
              color: valueColor,
            ),
          ),
        ],
      );
    }

    final body = horizontal
        ? Row(
            children: [
              leadingIcon(),
              const SizedBox(width: 14),
              Expanded(child: labelBlock()),
            ],
          )
        : Column(
            mainAxisAlignment: tall ? MainAxisAlignment.center : MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              leadingIcon(),
              const SizedBox(height: 14),
              labelBlock(),
            ],
          );

    return Container(
      padding: EdgeInsets.fromLTRB(
        horizontal ? 18 : 14,
        tall ? 18 : 14,
        horizontal ? 18 : 14,
        tall ? 18 : 12,
      ),
      decoration: BoxDecoration(
        color: background ?? AdminTheme.background,
        borderRadius: BorderRadius.circular(AdminTheme.radiusLg),
        border: Border.all(color: borderColor),
        boxShadow: AdminTheme.cardShadow,
      ),
      child: body,
    );
  }
}

class DashboardTopRankingCard extends StatelessWidget {
  const DashboardTopRankingCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.headerIcon,
    required this.headerTint,
    required this.rankTint,
    required this.rows,
  });

  final String title;
  final String subtitle;
  final IconData headerIcon;
  final Color headerTint;
  final Color rankTint;
  final List<({String label, int count})> rows;

  @override
  Widget build(BuildContext context) {
    final maxCount = rows.fold<int>(0, (max, row) => row.count > max ? row.count : max);

    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: headerTint.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(headerIcon, color: headerTint, size: 22),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        color: AdminTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AdminTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (rows.isEmpty)
            const Text(
              'Nenhum dado disponível.',
              style: TextStyle(color: AdminTheme.muted, fontSize: 13),
            )
          else
            for (var i = 0; i < rows.length; i++) ...[
              Row(
                children: [
                  CircleAvatar(
                    radius: 14,
                    backgroundColor: rankTint.withValues(alpha: 0.14),
                    child: Text(
                      '${i + 1}',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: rankTint,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      rows[i].label,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    formatCount(rows[i].count),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(
                  value: maxCount > 0 ? rows[i].count / maxCount : 0,
                  minHeight: 6,
                  backgroundColor: rankTint.withValues(alpha: 0.12),
                  color: rankTint,
                ),
              ),
              if (i != rows.length - 1) const SizedBox(height: 14),
            ],
        ],
      ),
    );
  }
}
