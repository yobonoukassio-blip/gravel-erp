import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

/// Gravel Ivoire ERP — root mobile app shell.
/// Phase 1 routing, auth, sync, and Riverpod providers land in W1-P03/W1-P04.
class GravelApp extends StatelessWidget {
  const GravelApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Gravel Ivoire ERP',
      debugShowCheckedModeBanner: false,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('fr'), Locale('en')],
      home: const Scaffold(
        body: Center(
          child: Text(
            'Phase 1 shell — features land in W1-P03 (sync) and W1-P04 (auth+i18n)',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
