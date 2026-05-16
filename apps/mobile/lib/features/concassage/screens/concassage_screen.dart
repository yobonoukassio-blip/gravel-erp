import 'package:flutter/material.dart';

import '../../../app/common/module_placeholder.dart';

class ConcassageScreen extends StatelessWidget {
  const ConcassageScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const ModulePlaceholder(
      title: 'Concassage',
      subtitle:
          'Saisie terrain des sessions de concassage primaire et secondaire. '
          'Tonnage entrant/sortant alimentera automatiquement le stockpile.',
      iconData: Icons.precision_manufacturing,
      requirementCode: 'CON-01',
    );
  }
}
