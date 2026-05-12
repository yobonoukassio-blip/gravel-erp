// Mobile list of active drilling plans on this device (D2-83).
//
// TODO(co-design): the card composition and tap target sizes (56dp min)
// are provisional — confirm with field operators during the co-design
// workshop scheduled per docs/operations/parallel-tracks.md.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/foration_providers.dart';
import 'drilled_hole_form.dart';

class DrillingPlanListScreen extends ConsumerWidget {
  const DrillingPlanListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final plans = ref.watch(activeDrillingPlansProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Plans de forage')),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: plans.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final plan = plans[index];
          return Card(
            child: InkWell(
              onTap: () {
                ref.read(selectedPlanIdProvider.notifier).state = plan.id;
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => DrilledHoleFormScreen(planId: plan.id),
                  ),
                );
              },
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      plan.benchLabel,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Profondeur cible: ${plan.targetDepthM} m · '
                      'Diamètre: ${plan.targetDiameterMm} mm',
                    ),
                    const SizedBox(height: 4),
                    Text('Foreuse: ${plan.machineLabel}'),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
