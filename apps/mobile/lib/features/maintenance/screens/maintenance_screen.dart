import 'package:flutter/material.dart';

import '../../../app/common/module_placeholder.dart';

class MaintenanceScreen extends StatelessWidget {
  const MaintenanceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const ModulePlaceholder(
      title: 'Maintenance',
      subtitle:
          'Ordres de travail (curatif + préventif), consommation pièces, '
          'temps d\'arrêt, MTBF/MTTR par équipement.',
      iconData: Icons.build,
      requirementCode: 'MNT-01..05',
    );
  }
}
