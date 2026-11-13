import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_theme.dart';

(String, String) splitVenueTime(String raw) {
  final parts = raw.trim().split(RegExp(r'[:hH]'));
  if (parts.length >= 2) {
    return (clampVenueTimePad(parts[0], 23), clampVenueTimePad(parts[1], 59));
  }
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.length >= 4) {
    return (
      clampVenueTimePad(digits.substring(0, 2), 23),
      clampVenueTimePad(digits.substring(2, 4), 59),
    );
  }
  if (digits.length == 3) {
    return (
      clampVenueTimePad(digits.substring(0, 1), 23),
      clampVenueTimePad(digits.substring(1, 3), 59),
    );
  }
  if (digits.isNotEmpty) {
    return (clampVenueTimePad(digits, 23), '00');
  }
  return ('10', '00');
}

String clampVenueTimePad(String raw, int max) {
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return '00';
  var value = int.tryParse(digits) ?? 0;
  if (value > max) value = max;
  return value.toString().padLeft(2, '0');
}

class VenueHmTimeInput extends StatefulWidget {
  const VenueHmTimeInput({super.key, required this.controller});

  final TextEditingController controller;

  @override
  State<VenueHmTimeInput> createState() => _VenueHmTimeInputState();
}

class _VenueHmTimeInputState extends State<VenueHmTimeInput> {
  late final TextEditingController _hour;
  late final TextEditingController _minute;
  late final FocusNode _hourFocus;
  late final FocusNode _minuteFocus;

  @override
  void initState() {
    super.initState();
    final parts = splitVenueTime(widget.controller.text);
    _hour = TextEditingController(text: parts.$1);
    _minute = TextEditingController(text: parts.$2);
    _hourFocus = FocusNode()..addListener(_onHourFocus);
    _minuteFocus = FocusNode()..addListener(_onMinuteFocus);
    widget.controller.addListener(_onParentChanged);
  }

  @override
  void didUpdateWidget(covariant VenueHmTimeInput oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_onParentChanged);
      widget.controller.addListener(_onParentChanged);
      _onParentChanged();
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onParentChanged);
    _hourFocus.dispose();
    _minuteFocus.dispose();
    _hour.dispose();
    _minute.dispose();
    super.dispose();
  }

  void _onParentChanged() {
    if (_hourFocus.hasFocus || _minuteFocus.hasFocus) return;
    final parts = splitVenueTime(widget.controller.text);
    if (_hour.text != parts.$1) _hour.text = parts.$1;
    if (_minute.text != parts.$2) _minute.text = parts.$2;
  }

  void _writeParent() {
    widget.controller.value = TextEditingValue(
      text: '${clampVenueTimePad(_hour.text, 23)}:${clampVenueTimePad(_minute.text, 59)}',
    );
  }

  void _selectAll(TextEditingController controller) {
    controller.selection = TextSelection(
      baseOffset: 0,
      extentOffset: controller.text.length,
    );
  }

  void _onHourFocus() {
    if (_hourFocus.hasFocus) {
      _selectAll(_hour);
      return;
    }
    final padded = clampVenueTimePad(_hour.text, 23);
    if (_hour.text != padded) _hour.text = padded;
    _writeParent();
  }

  void _onMinuteFocus() {
    if (_minuteFocus.hasFocus) {
      _selectAll(_minute);
      return;
    }
    final padded = clampVenueTimePad(_minute.text, 59);
    if (_minute.text != padded) _minute.text = padded;
    _writeParent();
  }

  void _onHourChanged(String value) {
    var digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.length > 2) digits = digits.substring(0, 2);
    if (digits.length == 1) {
      final n = int.tryParse(digits) ?? 0;
      if (n > 2) {
        final padded = clampVenueTimePad(digits, 23);
        _hour.value = TextEditingValue(
          text: padded,
          selection: const TextSelection.collapsed(offset: 2),
        );
        _minuteFocus.requestFocus();
      }
    } else if (digits.length == 2) {
      final padded = clampVenueTimePad(digits, 23);
      if (_hour.text != padded) {
        _hour.value = TextEditingValue(
          text: padded,
          selection: const TextSelection.collapsed(offset: 2),
        );
      }
      _minuteFocus.requestFocus();
    }
    _writeParent();
  }

  void _onMinuteChanged(String value) {
    var digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.length > 2) digits = digits.substring(0, 2);
    if (digits.length == 2) {
      final padded = clampVenueTimePad(digits, 59);
      if (_minute.text != padded) {
        _minute.value = TextEditingValue(
          text: padded,
          selection: const TextSelection.collapsed(offset: 2),
        );
      }
      _minuteFocus.unfocus();
    }
    _writeParent();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _digitBox(
          controller: _hour,
          focusNode: _hourFocus,
          onChanged: _onHourChanged,
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 2),
          child: Text(
            ':',
            style: TextStyle(
              fontFamily: AppTheme.fontFamily,
              fontWeight: FontWeight.w800,
              fontSize: 14,
              color: Color(0xFF282829),
            ),
          ),
        ),
        _digitBox(
          controller: _minute,
          focusNode: _minuteFocus,
          onChanged: _onMinuteChanged,
        ),
      ],
    );
  }

  Widget _digitBox({
    required TextEditingController controller,
    required FocusNode focusNode,
    required ValueChanged<String> onChanged,
  }) {
    return SizedBox(
      width: 32,
      height: 34,
      child: TextField(
        controller: controller,
        focusNode: focusNode,
        textAlign: TextAlign.center,
        keyboardType: TextInputType.number,
        maxLength: 2,
        style: const TextStyle(
          fontFamily: AppTheme.fontFamily,
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: Color(0xFF282829),
          height: 1.1,
        ),
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(2),
        ],
        decoration: InputDecoration(
          counterText: '',
          isDense: true,
          filled: true,
          fillColor: const Color(0xFFF7F7F8),
          contentPadding: const EdgeInsets.symmetric(vertical: 8, horizontal: 0),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: Color(0xFFE8E8EE)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: Color(0xFFE8E8EE)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: Color(0xFFF58634), width: 1.4),
          ),
        ),
        onChanged: onChanged,
      ),
    );
  }
}
