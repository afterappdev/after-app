import 'package:flutter/material.dart';

class AppTheme {
  /// Laranja da logo After
  static const Color brand = Color(0xFFF58634);
  /// Sage da logo
  static const Color brandSage = Color(0xFFAABFB8);
  /// Texto e superfícies escuras
  static const Color ink = Color(0xFF282829);
  /// Fundo claro, levemente esverdeado
  static const Color canvas = Color(0xFFF6F8F7);
  static const Color sageSoft = Color(0xFFE8F0ED);
  static const Color sageBorder = Color(0xFFC5D4CF);
  static const Color muted = Color(0xFF8A9391);

  static const Color brandPurple = brand;
  static const Color brandPurpleDark = brand;
  static const String fontFamily = 'Montserrat';

  static const TextStyle _montserrat = TextStyle(
    fontFamily: fontFamily,
    fontFamilyFallback: [fontFamily],
  );

  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(
      seedColor: brand,
      primary: brand,
      secondary: brandSage,
      brightness: Brightness.light,
      surface: Colors.white,
    ).copyWith(
      onPrimary: Colors.white,
      onSecondary: ink,
      onSurface: ink,
    );

    final textTheme = Typography.material2021(platform: TargetPlatform.android)
        .black
        .apply(
          fontFamily: fontFamily,
          bodyColor: ink,
          displayColor: ink,
        );

    return ThemeData(
      useMaterial3: true,
      fontFamily: fontFamily,
      colorScheme: scheme,
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      scaffoldBackgroundColor: canvas,
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: ink,
        elevation: 0,
        titleTextStyle: textTheme.titleLarge?.copyWith(
          fontFamily: fontFamily,
          fontWeight: FontWeight.w700,
          color: ink,
        ),
        toolbarTextStyle: textTheme.bodyMedium?.copyWith(
          fontFamily: fontFamily,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: const OutlineInputBorder(),
        hintStyle: _montserrat.copyWith(
          fontWeight: FontWeight.w400,
          color: muted,
        ),
        labelStyle: _montserrat.copyWith(fontWeight: FontWeight.w500),
        floatingLabelStyle: _montserrat.copyWith(
          fontWeight: FontWeight.w600,
          color: brand,
        ),
        errorStyle: _montserrat.copyWith(fontSize: 12),
        helperStyle: _montserrat.copyWith(fontSize: 12),
        prefixStyle: _montserrat,
        suffixStyle: _montserrat,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          backgroundColor: brand,
          foregroundColor: Colors.white,
          textStyle: _montserrat.copyWith(
            fontWeight: FontWeight.w600,
            fontSize: 16,
          ),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: brand,
          foregroundColor: Colors.white,
          textStyle: _montserrat.copyWith(
            fontWeight: FontWeight.w700,
            fontSize: 16,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: brand,
          side: const BorderSide(color: sageBorder),
          textStyle: _montserrat.copyWith(
            fontWeight: FontWeight.w600,
            fontSize: 14,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: brand,
          textStyle: _montserrat.copyWith(fontWeight: FontWeight.w600),
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: brand),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: ink,
        contentTextStyle: _montserrat.copyWith(
          color: Colors.white,
          fontSize: 14,
          fontWeight: FontWeight.w500,
        ),
      ),
      dialogTheme: DialogThemeData(
        titleTextStyle: textTheme.titleLarge?.copyWith(
          fontFamily: fontFamily,
          color: ink,
        ),
        contentTextStyle: textTheme.bodyMedium?.copyWith(
          fontFamily: fontFamily,
          color: ink,
        ),
      ),
      datePickerTheme: DatePickerThemeData(
        headerBackgroundColor: brand,
        headerForegroundColor: Colors.white,
        todayForegroundColor: const WidgetStatePropertyAll(brand),
        todayBackgroundColor: WidgetStatePropertyAll(
          brand.withValues(alpha: 0.12),
        ),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          textStyle: WidgetStateProperty.all(
            _montserrat.copyWith(fontWeight: FontWeight.w600, fontSize: 13),
          ),
        ),
      ),
      dropdownMenuTheme: DropdownMenuThemeData(
        textStyle: _montserrat.copyWith(fontSize: 16),
      ),
      listTileTheme: const ListTileThemeData(
        textColor: ink,
        iconColor: ink,
        titleTextStyle: TextStyle(
          fontFamily: fontFamily,
          fontSize: 16,
          fontWeight: FontWeight.w500,
          color: ink,
        ),
        subtitleTextStyle: TextStyle(
          fontFamily: fontFamily,
          fontSize: 14,
          color: ink,
        ),
      ),
    );
  }
}
