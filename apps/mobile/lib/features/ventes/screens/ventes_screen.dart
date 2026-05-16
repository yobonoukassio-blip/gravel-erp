import 'package:flutter/material.dart';

import '../../../app/common/module_placeholder.dart';

class VentesScreen extends StatelessWidget {
  const VentesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const ModulePlaceholder(
      title: 'Ventes & BL',
      subtitle:
          'Bon de livraison numérique signé client+chauffeur, génération '
          'offline avec numérotation à plage, hash de contenu.',
      iconData: Icons.receipt_long,
      requirementCode: 'VTE-03',
    );
  }
}
