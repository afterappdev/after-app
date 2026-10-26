import 'package:flutter/material.dart';

import '../../core/constants/venue_categories.dart';

/// Category field for venue profile setup. Limits the dropdown menu height so
/// the list stays compact and can be dismissed without picking an option.
class VenueCategoryDropdownField extends StatelessWidget {
  const VenueCategoryDropdownField({
    super.key,
    required this.value,
    required this.decoration,
    required this.style,
    required this.hintStyle,
    required this.onChanged,
    this.optionsSeed,
  });

  final String? value;
  final InputDecoration decoration;
  final TextStyle style;
  final TextStyle hintStyle;
  final ValueChanged<String?> onChanged;

  /// Passed to [VenueCategories.optionsFor] (handles legacy stored values).
  final String? optionsSeed;

  /// ~50% of the viewport inside safe areas (status bar, notch, home indicator).
  static double maxMenuHeight(BuildContext context) {
    final media = MediaQuery.of(context);
    final safeHeight =
        media.size.height - media.padding.top - media.padding.bottom;
    return safeHeight * 0.5;
  }

  @override
  Widget build(BuildContext context) {
    final options = VenueCategories.optionsFor(optionsSeed ?? value);

    return DropdownButtonFormField<String>(
      key: const Key('venue-category-dropdown'),
      initialValue: value != null && options.contains(value) ? value : null,
      isExpanded: true,
      style: style,
      dropdownColor: Colors.white,
      decoration: decoration,
      menuMaxHeight: maxMenuHeight(context),
      alignment: AlignmentDirectional.bottomStart,
      borderRadius: BorderRadius.circular(14),
      hint: Text(
        'Selecione a categoria',
        style: hintStyle,
        overflow: TextOverflow.ellipsis,
      ),
      items: options
          .map(
            (item) => DropdownMenuItem<String>(
              value: item,
              child: Text(item, overflow: TextOverflow.ellipsis),
            ),
          )
          .toList(),
      onChanged: onChanged,
    );
  }
}
