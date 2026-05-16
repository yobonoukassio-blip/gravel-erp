import 'package:flutter/material.dart';

import '../../../app/common/module_placeholder.dart';

class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const ModulePlaceholder(
      title: 'Alertes',
      subtitle:
          'Inbox des alertes ouvertes (sévérité critique/élevée/moyenne/faible) '
          'avec acquittement et résolution depuis le terrain.',
      iconData: Icons.notifications_active,
      requirementCode: 'DSH-06',
    );
  }
}
