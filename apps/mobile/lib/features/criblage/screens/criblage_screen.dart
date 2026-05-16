import 'package:flutter/material.dart';

import '../../../app/common/module_placeholder.dart';

class CriblageScreen extends StatelessWidget {
  const CriblageScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const ModulePlaceholder(
      title: 'Criblage',
      subtitle:
          'Classification calibre et enregistrement des non-conformités. '
          'Met à jour le stockpile event-sourced.',
      iconData: Icons.grid_view,
      requirementCode: 'CRI-01',
    );
  }
}
