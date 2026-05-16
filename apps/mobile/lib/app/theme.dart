import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Gravel Ivoire ERP — mobile design tokens.
///
/// Mirrors the web design system: deep midnight navy as the command surface,
/// warm gold as the action/selection accent, tinted off-white surfaces.
class GravelTokens {
  const GravelTokens._();

  // Navy ramp
  static const Color navy900 = Color(0xFF111827);
  static const Color navy800 = Color(0xFF1A2236);
  static const Color navy700 = Color(0xFF202A42);
  static const Color navy600 = Color(0xFF2A3654);
  static const Color navy500 = Color(0xFF3A4970);

  // Gold ramp
  static const Color goldBright = Color(0xFFFFD86A);
  static const Color gold = Color(0xFFE8B23E);
  static const Color goldDeep = Color(0xFFBA8323);
  static const Color goldSoft = Color(0xFFFFF6DC);

  // Neutral surfaces (warm-tinted off-white)
  static const Color bg = Color(0xFFFAFAF8);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surface2 = Color(0xFFF4F5F7);
  static const Color border = Color(0xFFE2E4E9);
  static const Color borderStrong = Color(0xFFC8CCD3);

  // Text
  static const Color text = Color(0xFF1A2236);
  static const Color textMuted = Color(0xFF6A7280);
  static const Color textSoft = Color(0xFF93989F);
  static const Color textOnNavy = Color(0xFFF5F6F8);
  static const Color textOnGold = Color(0xFF1A1306);

  // Semantic
  static const Color success = Color(0xFF2F9B66);
  static const Color successSoft = Color(0xFFE9F6EF);
  static const Color warning = Color(0xFFE5A340);
  static const Color warningSoft = Color(0xFFFCF2DD);
  static const Color danger = Color(0xFFD8453E);
  static const Color dangerSoft = Color(0xFFFAE6E5);
  static const Color info = Color(0xFF2B6BCC);
  static const Color infoSoft = Color(0xFFE6EEFA);

  // Radii
  static const double radiusSm = 4.0;
  static const double radius = 8.0;
  static const double radiusMd = 12.0;
  static const double radiusLg = 16.0;

  // Spacing
  static const double space1 = 4.0;
  static const double space2 = 8.0;
  static const double space3 = 12.0;
  static const double space4 = 16.0;
  static const double space5 = 20.0;
  static const double space6 = 24.0;
  static const double space8 = 32.0;
}

class GravelTheme {
  const GravelTheme._();

  static const _statusBarStyle = SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness: Brightness.dark,
  );

  static ThemeData light() {
    const colorScheme = ColorScheme(
      brightness: Brightness.light,
      primary: GravelTokens.gold,
      onPrimary: GravelTokens.textOnGold,
      primaryContainer: GravelTokens.goldSoft,
      onPrimaryContainer: GravelTokens.goldDeep,
      secondary: GravelTokens.navy700,
      onSecondary: GravelTokens.textOnNavy,
      secondaryContainer: GravelTokens.navy800,
      onSecondaryContainer: GravelTokens.textOnNavy,
      tertiary: GravelTokens.info,
      onTertiary: Colors.white,
      error: GravelTokens.danger,
      onError: Colors.white,
      errorContainer: GravelTokens.dangerSoft,
      onErrorContainer: GravelTokens.danger,
      surface: GravelTokens.surface,
      onSurface: GravelTokens.text,
      surfaceContainerLowest: GravelTokens.surface,
      surfaceContainerLow: GravelTokens.bg,
      surfaceContainer: GravelTokens.surface2,
      surfaceContainerHigh: GravelTokens.surface2,
      surfaceContainerHighest: GravelTokens.border,
      onSurfaceVariant: GravelTokens.textMuted,
      outline: GravelTokens.border,
      outlineVariant: GravelTokens.borderStrong,
      inverseSurface: GravelTokens.navy800,
      onInverseSurface: GravelTokens.textOnNavy,
      inversePrimary: GravelTokens.goldBright,
      shadow: Colors.black,
      scrim: Colors.black54,
      surfaceTint: GravelTokens.gold,
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: GravelTokens.bg,
      fontFamily: 'Roboto',
    );

    return base.copyWith(
      visualDensity: VisualDensity.adaptivePlatformDensity,
      appBarTheme: const AppBarTheme(
        backgroundColor: GravelTokens.navy800,
        foregroundColor: GravelTokens.textOnNavy,
        elevation: 0,
        scrolledUnderElevation: 2,
        centerTitle: false,
        systemOverlayStyle: _statusBarStyle,
        titleTextStyle: TextStyle(
          color: GravelTokens.textOnNavy,
          fontSize: 18,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.2,
        ),
        iconTheme: IconThemeData(color: GravelTokens.goldBright),
      ),
      cardTheme: CardThemeData(
        color: GravelTokens.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          side: const BorderSide(color: GravelTokens.border),
          borderRadius: BorderRadius.circular(GravelTokens.radiusMd),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: GravelTokens.gold,
          foregroundColor: GravelTokens.textOnGold,
          elevation: 0,
          padding: const EdgeInsets.symmetric(
            horizontal: GravelTokens.space5,
            vertical: GravelTokens.space3,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(GravelTokens.radius),
          ),
          textStyle: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.2,
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: GravelTokens.gold,
          foregroundColor: GravelTokens.textOnGold,
          padding: const EdgeInsets.symmetric(
            horizontal: GravelTokens.space5,
            vertical: GravelTokens.space3,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(GravelTokens.radius),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: GravelTokens.navy700,
          side: const BorderSide(color: GravelTokens.borderStrong),
          padding: const EdgeInsets.symmetric(
            horizontal: GravelTokens.space5,
            vertical: GravelTokens.space3,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(GravelTokens.radius),
          ),
        ),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: GravelTokens.gold,
        foregroundColor: GravelTokens.textOnGold,
        elevation: 4,
        highlightElevation: 8,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: GravelTokens.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: GravelTokens.space4,
          vertical: GravelTokens.space3,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(GravelTokens.radius),
          borderSide: const BorderSide(color: GravelTokens.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(GravelTokens.radius),
          borderSide: const BorderSide(color: GravelTokens.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(GravelTokens.radius),
          borderSide: const BorderSide(color: GravelTokens.gold, width: 1.5),
        ),
        labelStyle: const TextStyle(color: GravelTokens.textMuted),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: GravelTokens.surface2,
        side: const BorderSide(color: GravelTokens.border),
        labelStyle: const TextStyle(
          color: GravelTokens.text,
          fontWeight: FontWeight.w500,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: GravelTokens.border,
        thickness: 1,
        space: 1,
      ),
      navigationRailTheme: const NavigationRailThemeData(
        backgroundColor: GravelTokens.navy800,
        selectedIconTheme: IconThemeData(color: GravelTokens.goldBright),
        unselectedIconTheme: IconThemeData(color: GravelTokens.textSoft),
        selectedLabelTextStyle: TextStyle(
          color: GravelTokens.goldBright,
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelTextStyle: TextStyle(color: GravelTokens.textSoft),
        indicatorColor: GravelTokens.navy600,
      ),
      drawerTheme: const DrawerThemeData(
        backgroundColor: GravelTokens.navy800,
        scrimColor: Colors.black54,
        elevation: 8,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.only(
            topRight: Radius.circular(GravelTokens.radiusLg),
            bottomRight: Radius.circular(GravelTokens.radiusLg),
          ),
        ),
      ),
      listTileTheme: const ListTileThemeData(
        iconColor: GravelTokens.textMuted,
        textColor: GravelTokens.text,
        contentPadding: EdgeInsets.symmetric(
          horizontal: GravelTokens.space4,
          vertical: GravelTokens.space1,
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: GravelTokens.gold,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: GravelTokens.navy800,
        contentTextStyle: const TextStyle(color: GravelTokens.textOnNavy),
        actionTextColor: GravelTokens.goldBright,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(GravelTokens.radius),
        ),
      ),
      textTheme: base.textTheme.copyWith(
        displayLarge: base.textTheme.displayLarge?.copyWith(
          color: GravelTokens.text,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
        ),
        headlineLarge: base.textTheme.headlineLarge?.copyWith(
          color: GravelTokens.text,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
        ),
        headlineMedium: base.textTheme.headlineMedium?.copyWith(
          color: GravelTokens.text,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.2,
        ),
        titleLarge: base.textTheme.titleLarge?.copyWith(
          color: GravelTokens.text,
          fontWeight: FontWeight.w600,
        ),
        bodyLarge: base.textTheme.bodyLarge?.copyWith(
          color: GravelTokens.text,
        ),
        bodyMedium: base.textTheme.bodyMedium?.copyWith(
          color: GravelTokens.text,
        ),
        labelLarge: base.textTheme.labelLarge?.copyWith(
          color: GravelTokens.text,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

/// Shared brand mark widget — the gold "GV" tile from the web sidenav.
class GravelBrandMark extends StatelessWidget {
  const GravelBrandMark({super.key, this.size = 32});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: const RadialGradient(
          colors: [GravelTokens.goldBright, GravelTokens.gold, GravelTokens.goldDeep],
          stops: [0.0, 0.5, 1.0],
          center: Alignment(-0.3, -0.3),
        ),
        borderRadius: BorderRadius.circular(size * 0.28),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 4,
            offset: const Offset(0, 1),
          ),
        ],
        border: Border.all(color: GravelTokens.goldDeep.withValues(alpha: 0.4)),
      ),
      child: Center(
        child: Text(
          'GV',
          style: TextStyle(
            fontSize: size * 0.36,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.5,
            color: GravelTokens.textOnGold,
          ),
        ),
      ),
    );
  }
}
