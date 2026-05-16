import 'package:flutter/material.dart';

import '../theme.dart';

/// Module placeholder screen — reused for modules that are scaffolded but
/// whose forms/lists are not yet implemented.
class ModulePlaceholder extends StatelessWidget {
  const ModulePlaceholder({
    super.key,
    required this.title,
    required this.subtitle,
    required this.iconData,
    this.requirementCode,
  });

  final String title;
  final String subtitle;
  final IconData iconData;
  final String? requirementCode;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(GravelTokens.space6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  color: GravelTokens.goldSoft,
                  borderRadius: BorderRadius.circular(GravelTokens.radiusLg),
                  border: Border.all(color: GravelTokens.gold),
                ),
                child: Icon(iconData, size: 44, color: GravelTokens.goldDeep),
              ),
              const SizedBox(height: GravelTokens.space5),
              if (requirementCode != null)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: GravelTokens.space3,
                    vertical: GravelTokens.space1,
                  ),
                  decoration: BoxDecoration(
                    color: GravelTokens.navy800,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    requirementCode!,
                    style: const TextStyle(
                      color: GravelTokens.goldBright,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.5,
                    ),
                  ),
                ),
              const SizedBox(height: GravelTokens.space3),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: GravelTokens.text,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: GravelTokens.space2),
              Text(
                subtitle,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 14,
                  color: GravelTokens.textMuted,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: GravelTokens.space5),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: GravelTokens.space4,
                  vertical: GravelTokens.space2,
                ),
                decoration: BoxDecoration(
                  color: GravelTokens.warningSoft,
                  borderRadius: BorderRadius.circular(GravelTokens.radius),
                  border: Border.all(color: GravelTokens.warning),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.construction,
                        size: 16, color: GravelTokens.warning),
                    SizedBox(width: GravelTokens.space2),
                    Text(
                      'En cours de développement',
                      style: TextStyle(
                        color: GravelTokens.warning,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
