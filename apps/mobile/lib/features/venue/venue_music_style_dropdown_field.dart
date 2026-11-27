import 'package:flutter/material.dart';

import '../../core/constants/venue_music_styles.dart';
import 'venue_category_dropdown_field.dart';

class VenueMusicStyleDropdownField extends StatelessWidget {
  const VenueMusicStyleDropdownField({
    super.key,
    required this.value,
    required this.decoration,
    required this.style,
    required this.hintStyle,
    required this.onChanged,
  });

  final String? value;
  final InputDecoration decoration;
  final TextStyle style;
  final TextStyle hintStyle;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final selected =
        value != null && VenueMusicStyles.all.contains(value) ? value : null;

    return DropdownButtonFormField<String>(
      key: const Key('venue-music-style-dropdown'),
      initialValue: selected,
      isExpanded: true,
      style: style,
      dropdownColor: Colors.white,
      decoration: decoration,
      menuMaxHeight: VenueCategoryDropdownField.maxMenuHeight(context),
      alignment: AlignmentDirectional.bottomStart,
      borderRadius: BorderRadius.circular(14),
      hint: Text(
        'Selecione o estilo',
        style: hintStyle,
        overflow: TextOverflow.ellipsis,
      ),
      items: [
        const DropdownMenuItem<String>(
          value: '',
          child: Text('Não informar', overflow: TextOverflow.ellipsis),
        ),
        ...VenueMusicStyles.all.map(
          (item) => DropdownMenuItem<String>(
            value: item,
            child: Text(item, overflow: TextOverflow.ellipsis),
          ),
        ),
      ],
      onChanged: (next) => onChanged(next == null || next.isEmpty ? null : next),
    );
  }
}
