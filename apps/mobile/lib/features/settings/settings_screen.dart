import 'dart:ui' show Locale;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/i18n/i18n_service.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(i18nServiceProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          ListTile(
            title: const Text('Language'),
            trailing: DropdownButton<Locale>(
              value: locale,
              items: const [
                DropdownMenuItem(
                  value: Locale('fr'),
                  child: Text('Français (Côte d\'Ivoire)'),
                ),
                DropdownMenuItem(
                  value: Locale('en'),
                  child: Text('English (Côte d\'Ivoire)'),
                ),
              ],
              onChanged: (next) {
                if (next == null) return;
                ref.read(i18nServiceProvider.notifier).setLocale(next);
              },
            ),
          ),
        ],
      ),
    );
  }
}
