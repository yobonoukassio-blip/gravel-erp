import 'package:flutter/material.dart';

import '../../../app/common/module_placeholder.dart';

class StockpileScreen extends StatelessWidget {
  const StockpileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const ModulePlaceholder(
      title: 'Stockpile',
      subtitle:
          'Visualisation des soldes event-sourced par calibre et alertes '
          'seuil bas/haut. Détail des mouvements par jour opérationnel.',
      iconData: Icons.inventory_2,
      requirementCode: 'STK-01..03',
    );
  }
}
