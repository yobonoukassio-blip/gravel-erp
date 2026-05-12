// Foration feature Riverpod providers (D2-83).
//
// TODO(co-design): exposed surfaces (active plan list, current plan
// selection) are based on provisional wireframes — confirm with field
// operators during workshop.

import 'package:flutter_riverpod/flutter_riverpod.dart';

class DrillingPlanLite {
  const DrillingPlanLite({
    required this.id,
    required this.benchLabel,
    required this.targetDepthM,
    required this.targetDiameterMm,
    required this.machineLabel,
  });

  final String id;
  final String benchLabel;
  final double targetDepthM;
  final int targetDiameterMm;
  final String machineLabel;
}

/// Active drilling plans on this device for the current site.
/// Sourced from the local Drift cache (PowerSync downstream) — stubbed
/// in-memory here pending the codegen'd Drift table.
final activeDrillingPlansProvider = Provider<List<DrillingPlanLite>>((ref) {
  return const <DrillingPlanLite>[
    DrillingPlanLite(
      id: 'demo-plan-1',
      benchLabel: 'Banc N-12',
      targetDepthM: 12.0,
      targetDiameterMm: 89,
      machineLabel: 'DRILL-01',
    ),
  ];
});

/// Currently selected plan from the home screen.
final selectedPlanIdProvider = StateProvider<String?>((ref) => null);
