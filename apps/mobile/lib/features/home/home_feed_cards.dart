import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'home_visual.dart';

class HomeSectionTitle extends StatelessWidget {
  const HomeSectionTitle({super.key, required this.tone, required this.title});

  final HomeAccentTone tone;
  final String title;

  @override
  Widget build(BuildContext context) {
    final accent = HomeVisual.accent(tone);
    final icon = tone == HomeAccentTone.promotion
        ? Icons.local_fire_department_rounded
        : Icons.location_on_rounded;
    final parts = _sectionTitleParts(tone, title);
    final style = TextStyle(
      fontFamily: AppTheme.fontFamily,
      fontWeight: FontWeight.w700,
      fontSize: HomeVisual.titleFontSize,
      height: 1.2,
      color: HomeVisual.titleInk,
    );
    return DecoratedBox(
      decoration: BoxDecoration(
        color: HomeVisual.headerWash(tone),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(4, 4, 12, 4),
        child: Row(
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                color: HomeVisual.iconBackground(tone),
                shape: BoxShape.circle,
              ),
              child: SizedBox(
                width: 40,
                height: 40,
                child: Icon(icon, color: accent, size: 24),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text.rich(
                TextSpan(
                  style: style,
                  children: [
                    TextSpan(
                      text: parts.$1,
                      style: TextStyle(color: accent),
                    ),
                    if (parts.$2.isNotEmpty) TextSpan(text: parts.$2),
                  ],
                ),
                style: style,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

(String, String) _sectionTitleParts(HomeAccentTone tone, String title) {
  final lead = tone == HomeAccentTone.promotion ? 'Promoções' : 'Locais';
  if (!title.startsWith(lead)) return (title, '');
  var rest = title.substring(lead.length);
  if (tone == HomeAccentTone.promotion && rest.startsWith('/')) {
    rest = ' $rest';
  }
  return (lead, rest);
}

class HomeDayStrip extends StatelessWidget {
  const HomeDayStrip({
    super.key,
    required this.days,
    required this.selected,
    required this.labelFor,
    required this.onSelect,
    required this.onCalendar,
  });

  final List<DateTime> days;
  final DateTime selected;
  final String Function(DateTime day) labelFor;
  final ValueChanged<DateTime> onSelect;
  final VoidCallback onCalendar;

  @override
  Widget build(BuildContext context) {
    final scale = MediaQuery.textScalerOf(context).scale(1);
    final height = HomeVisual.dayChipHeight * (scale < 1 ? 1 : scale);
    return SizedBox(
      height: height,
      child: Row(
        children: [
          Expanded(
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: days.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final day = days[index];
                return HomeDayChip(
                  label: labelFor(day),
                  selected: _sameDay(day, selected),
                  onTap: () => onSelect(day),
                );
              },
            ),
          ),
          const SizedBox(width: 8),
          _CalendarButton(onTap: onCalendar),
        ],
      ),
    );
  }
}

class HomeDayChip extends StatelessWidget {
  const HomeDayChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final background = selected ? HomeVisual.orange : Colors.white;
    final border = selected ? HomeVisual.orange : HomeVisual.chipBorder;
    final foreground = selected ? Colors.white : HomeVisual.ink;
    return Material(
      color: background,
      shape: StadiumBorder(side: BorderSide(color: border)),
      child: InkWell(
        onTap: onTap,
        customBorder: const StadiumBorder(),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Center(
            child: Text(
              label,
              maxLines: 1,
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                fontWeight: FontWeight.w600,
                fontSize: 12,
                height: 1.1,
                color: foreground,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CalendarButton extends StatelessWidget {
  const _CalendarButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(side: BorderSide(color: HomeVisual.chipBorder)),
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: const SizedBox(
          width: HomeVisual.dayChipHeight,
          height: HomeVisual.dayChipHeight,
          child: Icon(
            Icons.calendar_today_outlined,
            size: 16,
            color: HomeVisual.orange,
          ),
        ),
      ),
    );
  }
}

class HomeOfferMark extends StatelessWidget {
  const HomeOfferMark({super.key});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Oferta',
      child: const SizedBox(
        width: 22,
        height: 22,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: HomeVisual.orange,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              '%',
              style: TextStyle(
                fontFamily: AppTheme.fontFamily,
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w800,
                height: 1,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class HomeAccentBar extends StatelessWidget {
  const HomeAccentBar({super.key, required this.tone});

  final HomeAccentTone tone;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: HomeVisual.accentBarWidth,
      child: ColoredBox(color: HomeVisual.accent(tone)),
    );
  }
}

class HomeOpenChip extends StatelessWidget {
  const HomeOpenChip({super.key, required this.isOpen});

  final bool isOpen;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: isOpen ? HomeVisual.openBg : HomeVisual.closedBg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        child: Text(
          isOpen ? 'Aberto' : 'Fechado',
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            color: isOpen ? HomeVisual.openFg : HomeVisual.closedFg,
            fontSize: 10,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class HomeDistanceLabel extends StatelessWidget {
  const HomeDistanceLabel({
    super.key,
    required this.label,
    required this.color,
  });

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.near_me_outlined, size: 12, color: color),
        const SizedBox(width: 3),
        Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontFamily: AppTheme.fontFamily,
            fontSize: 11,
            fontWeight: FontWeight.w500,
            color: color,
          ),
        ),
      ],
    );
  }
}

class HomePromoCard extends StatelessWidget {
  const HomePromoCard({
    super.key,
    required this.imageUrl,
    required this.venueName,
    required this.isOpen,
    required this.hasOpenInfo,
    required this.category,
    required this.dealTitle,
    required this.dealDetail,
    required this.validUntil,
    required this.onTap,
    this.distanceLabel,
    this.onImageTap,
  });

  final String imageUrl;
  final String venueName;
  final bool isOpen;
  final bool hasOpenInfo;
  final String? distanceLabel;
  final String category;
  final String dealTitle;
  final String dealDetail;
  final String validUntil;
  final VoidCallback onTap;
  final VoidCallback? onImageTap;

  @override
  Widget build(BuildContext context) {
    final showOffer = homePromotionShowsOfferMark(
      title: dealTitle,
      detail: dealDetail,
    );
    return _FeedCard(
      tone: HomeAccentTone.promotion,
      onTap: onTap,
      imageUrl: imageUrl,
      onImageTap: onImageTap,
      offerMark: showOffer,
      emptyIcon: Icons.local_offer_outlined,
      children: [
        _VenueName(venueName),
        const SizedBox(height: 4),
        _StatusRow(
          hasOpenInfo: hasOpenInfo,
          isOpen: isOpen,
          distanceLabel: distanceLabel,
          distanceColor: HomeVisual.muted,
        ),
        if (category.isNotEmpty) ...[
          const SizedBox(height: 4),
          _MetaLine(
            icon: _categoryIcon(category),
            text: category,
            color: HomeVisual.muted,
          ),
        ],
        if (dealTitle.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            dealTitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w700,
              fontSize: 12,
              color: HomeVisual.ink,
            ),
          ),
        ],
        if (dealDetail.isNotEmpty)
          Text(
            dealDetail,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 11,
              color: HomeVisual.muted,
              height: 1.25,
            ),
          ),
        if (validUntil.isNotEmpty) ...[
          const SizedBox(height: 6),
          _MetaLine(
            icon: Icons.calendar_today_outlined,
            text: 'Válido para o dia $validUntil',
            color: HomeVisual.orange,
            iconColor: HomeVisual.orange,
            fontSize: 10,
          ),
        ],
      ],
    );
  }
}

class HomeVenueCard extends StatelessWidget {
  const HomeVenueCard({
    super.key,
    required this.imageUrl,
    required this.venueName,
    required this.isOpen,
    required this.hasOpenInfo,
    required this.category,
    required this.city,
    required this.description,
    required this.onTap,
    this.distanceLabel,
  });

  final String imageUrl;
  final String venueName;
  final bool isOpen;
  final bool hasOpenInfo;
  final String? distanceLabel;
  final String category;
  final String city;
  final String description;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _FeedCard(
      tone: HomeAccentTone.venue,
      onTap: onTap,
      imageUrl: imageUrl,
      emptyIcon: Icons.storefront_outlined,
      children: [
        _VenueName(venueName),
        const SizedBox(height: 4),
        _StatusRow(
          hasOpenInfo: hasOpenInfo,
          isOpen: isOpen,
          distanceLabel: distanceLabel,
          distanceColor: HomeVisual.purple,
        ),
        if (category.isNotEmpty) ...[
          const SizedBox(height: 4),
          _MetaLine(
            icon: _categoryIcon(category),
            text: category,
            color: HomeVisual.muted,
          ),
        ],
        if (city.isNotEmpty) ...[
          const SizedBox(height: 2),
          _MetaLine(
            icon: Icons.location_on_outlined,
            text: city,
            color: HomeVisual.muted,
            iconColor: HomeVisual.purple,
          ),
        ],
        if (description.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            description,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: 11,
              color: HomeVisual.muted,
              height: 1.25,
            ),
          ),
        ],
      ],
    );
  }
}

class _VenueName extends StatelessWidget {
  const _VenueName(this.name);

  final String name;

  @override
  Widget build(BuildContext context) {
    return Text(
      name,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(
        fontFamily: AppTheme.fontFamily,
        fontWeight: FontWeight.w800,
        fontSize: 17,
        height: 1.15,
        color: HomeVisual.ink,
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.hasOpenInfo,
    required this.isOpen,
    required this.distanceLabel,
    required this.distanceColor,
  });

  final bool hasOpenInfo;
  final bool isOpen;
  final String? distanceLabel;
  final Color distanceColor;

  @override
  Widget build(BuildContext context) {
    final distance = distanceLabel;
    final hasDistance = distance != null && distance.isNotEmpty;
    if (!hasOpenInfo && !hasDistance) return const SizedBox.shrink();
    return Wrap(
      spacing: 8,
      runSpacing: 4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (hasOpenInfo) HomeOpenChip(isOpen: isOpen),
        if (hasDistance)
          HomeDistanceLabel(label: distance, color: distanceColor),
      ],
    );
  }
}

class _MetaLine extends StatelessWidget {
  const _MetaLine({
    required this.icon,
    required this.text,
    required this.color,
    this.iconColor,
    this.fontSize = 11,
  });

  final IconData? icon;
  final String text;
  final Color color;
  final Color? iconColor;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        if (icon != null) ...[
          Icon(icon, size: 12, color: iconColor ?? color),
          const SizedBox(width: 4),
        ],
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontSize: fontSize,
              color: color,
            ),
          ),
        ),
      ],
    );
  }
}

class _FeedCard extends StatelessWidget {
  const _FeedCard({
    required this.tone,
    required this.onTap,
    required this.imageUrl,
    required this.emptyIcon,
    required this.children,
    this.onImageTap,
    this.offerMark = false,
  });

  final HomeAccentTone tone;
  final VoidCallback onTap;
  final String imageUrl;
  final IconData emptyIcon;
  final List<Widget> children;
  final VoidCallback? onImageTap;
  final bool offerMark;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(HomeVisual.cardRadius),
        boxShadow: HomeVisual.cardShadow,
      ),
      child: Material(
        color: HomeVisual.cardBackground(tone),
        borderRadius: BorderRadius.circular(HomeVisual.cardRadius),
        clipBehavior: Clip.antiAlias,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              HomeAccentBar(tone: tone),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _CardImage(
                        imageUrl: imageUrl,
                        emptyIcon: emptyIcon,
                        iconColor: HomeVisual.accent(tone),
                        offerMark: offerMark,
                        onTap: onImageTap ?? onTap,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: InkWell(
                          onTap: onTap,
                          borderRadius: BorderRadius.circular(12),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: children,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CardImage extends StatelessWidget {
  const _CardImage({
    required this.imageUrl,
    required this.emptyIcon,
    required this.iconColor,
    required this.offerMark,
    this.onTap,
  });

  final String imageUrl;
  final IconData emptyIcon;
  final Color iconColor;
  final bool offerMark;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final image = ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: HomeVisual.imageWidth,
        child: Stack(
          fit: StackFit.expand,
          children: [
            const ColoredBox(color: Color(0xFFEEF3F1)),
            if (imageUrl.isEmpty)
              Center(child: Icon(emptyIcon, color: iconColor))
            else
              Image.network(
                imageUrl,
                fit: BoxFit.cover,
                filterQuality: FilterQuality.medium,
                errorBuilder: (_, _, _) => const ColoredBox(
                  color: Color(0xFFEEF3F1),
                  child: Icon(
                    Icons.broken_image_outlined,
                    color: HomeVisual.muted,
                  ),
                ),
              ),
            if (offerMark)
              const Positioned(top: 6, left: 6, child: HomeOfferMark()),
          ],
        ),
      ),
    );
    if (onTap == null) return image;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: image,
    );
  }
}

IconData? _categoryIcon(String category) {
  if (category.isEmpty) return null;
  final first = category.runes.first;
  if (first > 0xFF) return null;
  final value = category.toLowerCase();
  if (value.contains('restaur') || value.contains('comida')) {
    return Icons.restaurant_outlined;
  }
  if (value.contains('bar') ||
      value.contains('pub') ||
      value.contains('chopp')) {
    return Icons.local_bar_outlined;
  }
  if (value.contains('balada') ||
      value.contains('show') ||
      value.contains('músic')) {
    return Icons.music_note_outlined;
  }
  return Icons.storefront_outlined;
}

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;
