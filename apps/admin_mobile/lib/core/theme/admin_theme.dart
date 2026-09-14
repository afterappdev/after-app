import 'package:flutter/material.dart';

class AdminTheme {
  static const Color orange = Color(0xFFF58634);
  static const Color brand = orange;
  static const Color textPrimary = Color(0xFF1C1C1E);
  static const Color ink = textPrimary;
  static const Color textSecondary = Color(0xFF8A8F8E);
  static const Color muted = textSecondary;
  static const Color border = Color(0xFFE8E8E8);
  static const Color green = Color(0xFF2EBA6A);
  static const Color pink = Color(0xFFE45B73);
  static const Color purple = Color(0xFF7B61FF);
  static const Color background = Color(0xFFFFFFFF);
  static const Color canvas = background;
  static const Color brandSage = Color(0xFFAABFB8);
  static const Color sageSoft = Color(0xFFF3F4F4);
  static const Color sageBorder = border;
  static const String fontFamily = 'Montserrat';

  static const double radiusLg = 20;
  static const double radiusMd = 18;

  static List<BoxShadow> get cardShadow => [
    BoxShadow(
      color: Colors.black.withValues(alpha: 0.04),
      blurRadius: 14,
      offset: const Offset(0, 4),
    ),
  ];

  static ThemeData get light {
    final textTheme = Typography.material2021(
      platform: TargetPlatform.android,
    ).black.apply(
      fontFamily: fontFamily,
      bodyColor: textPrimary,
      displayColor: textPrimary,
    );

    return ThemeData(
      useMaterial3: true,
      fontFamily: fontFamily,
      colorScheme: ColorScheme.fromSeed(
        seedColor: orange,
        primary: orange,
        secondary: brandSage,
        brightness: Brightness.light,
        surface: background,
      ).copyWith(onPrimary: Colors.white, onSurface: textPrimary),
      scaffoldBackgroundColor: background,
      dividerColor: border,
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        foregroundColor: textPrimary,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        titleSpacing: 20,
        titleTextStyle: textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          fontSize: 22,
          color: textPrimary,
        ),
      ),
      cardTheme: CardThemeData(
        color: background,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusLg),
          side: const BorderSide(color: border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: background,
        hintStyle: const TextStyle(
          color: textSecondary,
          fontWeight: FontWeight.w400,
          fontSize: 16,
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 18,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: const BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: const BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: const BorderSide(color: orange, width: 1.4),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(54),
          backgroundColor: orange,
          foregroundColor: Colors.white,
          disabledBackgroundColor: orange.withValues(alpha: 0.55),
          disabledForegroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusMd),
          ),
          textStyle: const TextStyle(
            fontFamily: fontFamily,
            fontWeight: FontWeight.w800,
            fontSize: 16,
            letterSpacing: 0.4,
          ),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: background,
        surfaceTintColor: Colors.transparent,
        indicatorColor: orange.withValues(alpha: 0.14),
        elevation: 0,
        height: 72,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            fontFamily: fontFamily,
            fontSize: 12,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            color: selected ? orange : textSecondary,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          return IconThemeData(
            size: 24,
            color: states.contains(WidgetState.selected)
                ? orange
                : textSecondary,
          );
        }),
      ),
      chipTheme: ChipThemeData(
        selectedColor: orange.withValues(alpha: 0.14),
        backgroundColor: sageSoft,
        labelStyle: const TextStyle(
          fontFamily: fontFamily,
          fontWeight: FontWeight.w600,
          color: textPrimary,
        ),
        side: BorderSide.none,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: orange),
    );
  }
}
